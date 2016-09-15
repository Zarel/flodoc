var path = require('path');
var fs = require('fs');
var temp = require('temp');
var wrench = require('wrench');
var spawn = require('child_process').spawn;

var TEMP_DIR_NAME = 'flotate';
var EXCLUDED_PATHS = /(\.git)/;
var ELIGIBLE_FILE_EXTS = [ '.js', '.jsx' ];
var TRIGGER_PATTERN = /@flow/;
var ASSUMED_ENCODING = 'utf8';
var FLOW_CONFIG_FILE = '.flowconfig';

var converter = require('./converter');

exports.jsToFlow = converter.jsToFlow;

function debug() {
    if (process.env.FLOTATE_DEBUG) {
        console.log.apply(console, ['[DEBUG]'].concat(Array.prototype.slice.call(arguments)));
    }
}

var isTypescript = false;
function transformFileInPlace(filePath) {
    if (ELIGIBLE_FILE_EXTS.indexOf(path.extname(filePath)) === -1) {
        return; // uninteresting file type
    }
    if (fs.statSync(filePath).isDirectory()) {
        return; // directories can't be transformed
    }
    var fileContent = fs.readFileSync(filePath, ASSUMED_ENCODING);
    if (!TRIGGER_PATTERN.test(fileContent)) {
        return; // non-flow-annotated file // TODO: What about $ flow check --all though..?
    }
    if (isTypescript) filePath += path.extname(filePath).replace('js', 'ts');
    debug('Transformed: ' + filePath);
    fs.writeFileSync(filePath, converter.jsToFlow(fileContent), { encoding: ASSUMED_ENCODING });
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
