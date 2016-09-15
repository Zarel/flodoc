#!/usr/bin/env node

try {
    if (!process.argv[2]) {
        console.log('Usage: flodoc [COMMAND]');
    } else if (process.argv[2] === 'check') {
        require(__dirname + '/flodoc').flowCheck(process.argv[3] || '.');
    } else if (process.argv[2] === 'convert') {
        console.log(require(__dirname + '/flodoc').jsToFlow('' + require('fs').readFileSync(process.argv[3])));
    } else {
       throw new Error('Only the "check" command is currently supported; try "flodoc check ."');
    }
} catch (e) {
    console.log(e + ''); // print the error
    process.exit(1);
}
