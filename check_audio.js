const fs = require('fs');
const path = require('path');

const audioDir = 'd:/Open_Project/kimi/Stories/Story_212720_05072026/Audio';

if (!fs.existsSync(audioDir)) {
    console.log('Directory NOT FOUND:', audioDir);
    process.exit(1);
}

const files = fs.readdirSync(audioDir);
if (files.length === 0) {
    console.log('Directory is EMPTY');
    process.exit(0);
}

files.forEach(f => {
    const fullPath = path.join(audioDir, f);
    const stat = fs.statSync(fullPath);
    const buf = Buffer.alloc(16);
    const fd = fs.openSync(fullPath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    const hex = buf.slice(0, bytesRead).toString('hex');
    const isID3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
    const isHTML = buf.toString('ascii').trim().startsWith('<');
    const isJSON = buf[0] === 0x7B || buf[0] === 0x5B;
    console.log(`${f}: size=${stat.size}B hex=${hex} ID3=${isID3} sync=${isSync} html=${isHTML} json=${isJSON}`);
});

// Also check Stories/Audio shared dir
const sharedAudio = 'd:/Open_Project/kimi/Stories/Audio';
if (fs.existsSync(sharedAudio)) {
    console.log('\n--- Shared Stories/Audio ---');
    fs.readdirSync(sharedAudio).forEach(f => {
        const stat = fs.statSync(path.join(sharedAudio, f));
        console.log(`${f}: ${stat.size}B`);
    });
}