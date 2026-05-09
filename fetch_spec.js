const https = require('https');
const fs = require('fs');

// Fetch OpenAPI spec
https.get('https://voiceapi.csv666.ru/openapi.json', (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
        fs.writeFileSync('D:/Open_Project/kimi/openapi_spec.json', data);
        
        try {
            const spec = JSON.parse(data);
            const output = [];
            
            // Security schemes
            const schemes = spec.components?.securitySchemes || {};
            output.push('=== SECURITY SCHEMES ===');
            output.push(JSON.stringify(schemes, null, 2));
            
            // Endpoint security
            const paths = spec.paths || {};
            const taskPost = paths['/tasks']?.post;
            if (taskPost) {
                output.push('\n=== POST /tasks SECURITY ===');
                output.push(JSON.stringify(taskPost.security, null, 2));
                output.push('\n=== POST /tasks PARAMETERS ===');
                output.push(JSON.stringify(taskPost.parameters, null, 2));
            }
            
            fs.writeFileSync('D:/Open_Project/kimi/spec_analysis.txt', output.join('\n'));
            console.log('Done! Check spec_analysis.txt');
            console.log(output.join('\n').substring(0, 2000));
        } catch(e) {
            fs.writeFileSync('D:/Open_Project/kimi/spec_analysis.txt', 'Parse error: ' + e.message + '\nRaw: ' + data.substring(0, 500));
            console.log('Parse error:', e.message);
        }
    });
}).on('error', e => {
    fs.writeFileSync('D:/Open_Project/kimi/spec_analysis.txt', 'Fetch error: ' + e.message);
    console.log('Error:', e.message);
});