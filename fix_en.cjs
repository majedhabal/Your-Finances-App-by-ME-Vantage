const fs = require('fs');
let data = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));

function fixDict(d) {
    let new_d = {};
    for (let k in d) {
        let new_k = k.replace(/dependant/g, 'dependent').replace(/Dependant/g, 'Dependent');
        if (typeof d[k] === 'object' && d[k] !== null) {
            new_d[new_k] = fixDict(d[k]);
        } else {
            new_d[new_k] = d[k];
        }
    }
    return new_d;
}

fs.writeFileSync('src/locales/en.json', JSON.stringify(fixDict(data), null, 2));
