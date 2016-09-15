var path = require('path');
var fs = require('fs');
var esprima = require('esprima-fb');
var falafel = require('falafel');
var temp = require('temp');
var wrench = require('wrench');
var spawn = require('child_process').spawn;

var TEMP_DIR_NAME = 'flotate';
var EXCLUDED_PATHS = /(\.git)/;
var ELIGIBLE_FILE_EXTS = [ '.js', '.jsx' ];
var TRIGGER_PATTERN = /@flow/;
var ASSUMED_ENCODING = 'utf8';
var FLOW_CONFIG_FILE = '.flowconfig';

function debug() {
    if (process.env.FLOTATE_DEBUG) {
        console.log.apply(console, ['[DEBUG]'].concat(Array.prototype.slice.call(arguments)));
    }
}

function jsToAst(jsSource, opts) {
    opts = opts || {};
    opts.range = true;
    opts.attachComment = true;
    return esprima.parse(jsSource, opts);
}

function commentToFlowType(flotateString) { // => flowTypeString
    // /** @typedef {MATCH1} MATCH2 */
    var typedefRe = /^\/\*\*[\s\*]*@typedef\s*{(.*)}\s*([A-Za-z0-9]+)[\s*]*\*\//m;
    var m;
    if (m = typedefRe.exec(flotateString)) {
        var type = m[1];
        var name = m[2];
        var flowTypedef = 'type ' + name + ' = ' + type + '; ';
        flotateString = flotateString.slice(0, m.index) + flowTypedef + flotateString.slice(m.index); 
    }

    return flotateString
        .replace(/\/\*\s*flow-ignore-begin\*\//, '/*')       // /* flow-ignore-begin*/        => /*
        .replace(/\/\*\s*flow-ignore-end\*\//, '*/')         // /* flow-ignore-end*/          => */
        .replace(/\/\*\s*::([\s\S]+?)\*\//, '$1')            // /* :: type BarBaz = number */ => type BarBaz = number
        .replace(/\/\*\s*flow-include([\s\S]+?)\*\//, '$1'); // /* flow-include type BarBaz = number */ => type BarBaz = number
}

function findLeadingComments(node, jsSource) {
    var isIncompleteFunctionExpression = node.type === 'FunctionExpression' && jsSource.charAt(node.range[0]) === '{';
    if (node.leadingComments && !isIncompleteFunctionExpression) return node.leadingComments;
    if (node.id && node.id.leadingComments) return node.id.leadingComments;

    if (node.parent.type === 'AssignmentExpression') {
        node = node.parent;
        if (node.leadingComments) return node.leadingComments;
    }
    if (node.parent.type === 'VariableDeclarator') {
        node = node.parent;
        if (node.leadingComments) return node.leadingComments;
    }
    if (node.parent.type === 'VariableDeclaration') {
        node = node.parent;
        if (node.leadingComments) return node.leadingComments;
    }
    if (node.parent.type === 'Property') {
        node = node.parent;
        if (node.leadingComments) return node.leadingComments;
    }

    // every once in a while, a leading comment ends up in an even weirder place, like
    // the trailingComments of some random preceding node, so we have to just manually
    // do a text search through the source for it (believe me, this is easier than
    // digging through the tree for it)
    var root = node;
    while (root.parent) root = root.parent;
    if (!root.comments || !root.comments.length) return;

    var nodeStart = node.range[0];
    for (var i = root.comments.length - 1; i >= 0; i--) {
        var commentEnd = root.comments[i].range[1];
        if (commentEnd > nodeStart) continue;
        // it is now the last comment before the node
        if (!/[^\s]/.test(jsSource.slice(commentEnd, nodeStart))) {
            // nothing but whitespace characters between the comment and the node;
            return [root.comments[i]];
        }
        break;
    }
}

function processFunctionNode(node, body, jsSource) {
    body = body || node.body;

    var source = node.source();
    var pos = body.range[0] - node.range[0];
    var header = source.substr(0, pos);
    var body = source.substr(pos);
    var jsDocParams = undefined;
    var jsDocReturns = undefined;
    var jsDocMembers = undefined;

    // First check if there is *fancy* type annotation in the leading comment
    var leadingComments = findLeadingComments(node, jsSource) || [];

    for (var i = 0; i < leadingComments.length; i++) {
        // The same `:` prefix!
        // There is no ambiguity, as instances are in different contexts
        // /* : (x: String, y: number): boolean
        var commentSource = leadingComments[i].source();
        var m = commentSource.match(/\/\*\s*:([\s\S]+?)\*\//)

        if (m) {
            // replace everything after first brace
            header = header.replace(/\([\s\S]*$/, m[1]);
            node.update(header + body);
            leadingComments[i].update("");
            return;
        }

        if (commentSource.slice(0, 3) !== '/**') continue;
        // @param {MATCH1} MATCH2
        var paramRe = /@param\s*{(.*)}\s*([^\s-]*)/g;
        jsDocParams = [];
        while (m = paramRe.exec(commentSource)) {
            var type = m[1];
            var name = m[2];
            jsDocParams.push('' + name + ': ' + type);
        }
        // @return {MATCH1}
        var returnRe = /@returns?\s*{(.*)}/;
        m = returnRe.exec(commentSource);
        if (m) jsDocReturns = m[1];
    }

    // MethodDefinitions also don't have a way to get the name... wtf Esprima,
    // have an AST parser if it can't do anything?
    if (/^constructor\s*\(/.test(source)) {
        // /** @type {MATCH2} */ this.MATCH3
        var memberRe = /\/\*\*[\s\*]*@(type|private|protected|public)\s*{(.*)}[\s*]*\*\/\s*this\.([A-Za-z0-9]+)/gm;
        var m;
        jsDocMembers = [];
        while (m = memberRe.exec(source)) {
            var type = m[2];
            var name = m[3];
            jsDocMembers.push('' + name + ': ' + type + '; ');
        }
        if (!jsDocMembers.length) jsDocMembers = undefined;
    }

    if (jsDocParams || jsDocReturns || jsDocMembers) {
        var newParams = '(';
        var paramLength = 0;
        if (jsDocParams) paramLength = jsDocParams.length;
        if (node.params) paramLength = node.params.length;
        for (var i = 0; i < paramLength; i++) {
            if (i > 0) newParams += ', ';
            if (jsDocParams && jsDocParams[i]) {
                newParams += jsDocParams[i];
            } else {
                newParams += node.params[i].source();
            }
        }
        newParams += ')';
        if (jsDocReturns) newParams += ': ' + jsDocReturns;
        newParams += ' ';
        header = header.replace(/\([\s\S]*$/, newParams);
        var members = '';
        if (jsDocMembers) members = jsDocMembers.join('');
        node.update(members + header + body);
        return;
    }

    // Otherwise replace in-parameter-list annotation
    header = header
        .replace(/\/\*\s*:([\s\S]+?)\*\//g, ': $1'); // /* : FooBar */ => : FooBar

    // If this is an "ES6 method" function, its return-type annotation is included as leadingComments
    if (node.parent.method && node.leadingComments) {
        node.leadingComments.forEach(function(comNode) {
            comNode.update(comNode.source().replace(/\/\*\s*:([\s\S]+?)\*\//g, ': $1'));// /* : FooBar */ => : FooBar
        });
    }

    node.update(header + body);
}

function processVariableNode(node, jsSource) {
    var leadingComments = findLeadingComments(node, jsSource);
    if (!leadingComments) return;

    var name = node.id.source();

    var jsDocType = undefined;

    for (var i = 0; i < leadingComments.length; i++) {
        if (typeof leadingComments[i].source !== 'function') {
            continue;
        }
        var commentSource = leadingComments[i].source();

        // @type {MATCH2}
        var memberRe = /@(type|constant|const)\s*{(.*)}/m;
        var m;
        if (m = memberRe.exec(commentSource)) {
            var type = m[2];
            jsDocType = type;
        }
    }

    if (jsDocType) {
        var source = node.source();
        node.update(name + ': ' + jsDocType + source.slice(name.length));
    }
}

function jsToFlow(jsSource) {
    return '' + falafel(jsSource, { parse: jsToAst }, function(node) {
        if (node.type === 'FunctionExpression' && node.parent.type === 'Property') return;
        if (node.type === 'MethodDefinition') {
            processFunctionNode(node, node.value.body, jsSource);
        } else if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
            processFunctionNode(node, undefined, jsSource);
        } else if (node.type === 'Property' && node.value && node.value.type === 'FunctionExpression') {
            processFunctionNode(node, node.value.body, jsSource);
        } else if (node.type === 'VariableDeclarator') {
            processVariableNode(node, jsSource);
        } else if (node.type === 'Block') {
            node.update(commentToFlowType(node.source()));
        }
    });
}

exports.jsToFlow = jsToFlow;

var isTypescript = false;
function transformFileInPlace(filePath) {
    if (fs.statSync(filePath).isDirectory()) {
        return; // directories can't be transformed
    }
    if (ELIGIBLE_FILE_EXTS.indexOf(path.extname(filePath)) === -1) {
        return; // uninteresting file type
    }
    var fileContent = fs.readFileSync(filePath, ASSUMED_ENCODING);
    if (!TRIGGER_PATTERN.test(fileContent)) {
        return; // non-flow-annotated file // TODO: What about $ flow check --all though..?
    }
    if (isTypescript) filePath += path.extname(filePath).replace('js', 'ts');
    debug('Transformed: ' + filePath);
    fs.writeFileSync(filePath, jsToFlow(fileContent), { encoding: ASSUMED_ENCODING });
}

function translateIncludePath(pathToTranslate, sourceDir, tempDir) {
    if (pathToTranslate.match(/^\.\.\//)) {
        return path.join(tempDir.replace(/\/[^/]+/g, '../'), '../' /* for "/private" */, sourceDir, pathToTranslate);
    } else {
        return pathToTranslate;
    }
}

exports.translateIncludePath = translateIncludePath;

function transformFlowConfig(sourceDir, tempDir) {
    var configContent = fs.readFileSync(path.join(tempDir, FLOW_CONFIG_FILE), ASSUMED_ENCODING);
    configContent = configContent.split('\n').map(function(line) {
        return line.match(/^\.\.\//) ? translateIncludePath(line, sourceDir, tempDir) : line;
    }).join('\n');
    fs.writeFileSync(path.join(tempDir, FLOW_CONFIG_FILE), configContent, { encoding: ASSUMED_ENCODING });
}

function flowCheck(sourceDir, flowBin) {
    sourceDir = path.resolve(sourceDir);
    debug('Source dir: ' + sourceDir);
    var flowconfig = path.join(sourceDir, FLOW_CONFIG_FILE);
    if (!fs.existsSync(flowconfig)) {
        throw new Error('Expected config file "' + flowconfig + '" does not exist');
    }
    temp.track(); // automatically track and cleanup files at exit
    var tempDir = path.join(temp.mkdirSync(TEMP_DIR_NAME), TEMP_DIR_NAME);
    wrench.copyDirSyncRecursive(sourceDir, tempDir, { exclude: EXCLUDED_PATHS });
    process.chdir(tempDir);
    debug('Temp dir: ' + tempDir);
    transformFlowConfig(sourceDir, tempDir);
    wrench.readdirSyncRecursive('.').forEach(transformFileInPlace);
    var flow = spawn(flowBin || 'flow', ['check', '--strip-root'], {
        stdio: 'inherit' // Retain colors in output
    });
    flow.on('error', function(error) {
        console.error((error.errno === 'ENOENT') ?
            'Please install Flow before using Flotate.\nhttp://flowtype.org/docs/getting-started.html' :
            (error + ''));
        process.exit(1);
    });
    flow.on('exit', process.exit); // Proxy actual exit value from Flow
}

exports.flowCheck = flowCheck;
