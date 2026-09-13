import json
with open('src/locales/en.json', 'r') as f:
    data = json.load(f)

# The keys should have 'dependent' instead of 'dependant'.
# Let's find all keys with 'dependant' and rename them back to 'dependent'.
def fix_dict(d):
    new_d = {}
    for k, v in d.items():
        new_k = k.replace('dependant', 'dependent').replace('Dependant', 'Dependent')
        if isinstance(v, dict):
            new_d[new_k] = fix_dict(v)
        elif isinstance(v, str):
            # keep the value as is (with dependant)
            new_d[new_k] = v
        else:
            new_d[new_k] = v
    return new_d

fixed_data = fix_dict(data)

with open('src/locales/en.json', 'w') as f:
    json.dump(fixed_data, f, indent=2)

