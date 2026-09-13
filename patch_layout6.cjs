const fs = require('fs');
const file = 'src/components/Layout.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `            onUpdateProfile={onUpdateProfile}
          />
        </>
      )}
    </div>`;

const replacement = `            onUpdateProfile={onUpdateProfile}
          />
          <TokenShopModal
            isOpen={isTokenShopOpen}
            onClose={() => setIsTokenShopOpen(false)}
            uid={profile?.uid || ''}
            profile={profile}
            onSuccess={(updatedProfile) => {
              if (onUpdateProfile) onUpdateProfile(updatedProfile);
              setIsTokenShopOpen(false);
            }}
          />
        </>
      )}
    </div>`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
