const fs = require('fs');
const file = 'src/components/TokenShopModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetLogic = `  const handlePurchase = async () => {
    if (!selectedPack || !uid) return;
    const pack = packs.find(p => p.id === selectedPack);
    if (!pack) return;

    setIsProcessing(true);
    try {
      const userRef = doc(db, 'users', uid);
      const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
      const newTokens = currentTokens + pack.tokens;
      
      await updateDoc(userRef, { 
        vantageAiTokens: newTokens,
        updatedAt: serverTimestamp()
      });
      
      onSuccess({ ...profile, vantageAiTokens: newTokens });
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'Purchase Tokens');
    } finally {
      setIsProcessing(false);
    }
  };`;

const replacementLogic = `  const grantTokens = async (packId: string) => {
    const pack = packs.find(p => p.id === packId);
    if (!pack || !uid) return;
    
    try {
      const userRef = doc(db, 'users', uid);
      const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
      const newTokens = currentTokens + pack.tokens;
      
      await updateDoc(userRef, { 
        vantageAiTokens: newTokens,
        updatedAt: serverTimestamp()
      });
      
      onSuccess({ ...profile, vantageAiTokens: newTokens });
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'Purchase Tokens');
    }
  };

  const handleGooglePlayPurchase = async () => {
    if (!selectedPack) return;
    setIsProcessing(true);
    try {
      // PWABuilder Android implementation uses the W3C Digital Goods API
      if ('getDigitalGoodsService' in window) {
        // @ts-ignore
        const service = await window.getDigitalGoodsService('https://play.google.com/billing');
        
        const request = new PaymentRequest([{
          supportedMethods: 'https://play.google.com/billing',
          data: { sku: selectedPack }
        }]);
        
        const response = await request.show();
        await response.complete('success');
        
        // Acknowledge the purchase (required by Google Play)
        // @ts-ignore
        await service.acknowledge(response.details.token, 'onetime');
        
        await grantTokens(selectedPack);
      } else {
        console.log('Digital Goods API not available. Simulating purchase for testing.');
        await grantTokens(selectedPack);
      }
    } catch (err: any) {
      console.error('Google Play purchase failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplePayPurchase = async () => {
    if (!selectedPack) return;
    const pack = packs.find(p => p.id === selectedPack);
    setIsProcessing(true);
    try {
      // PWABuilder iOS uses standard Payment Request API for Apple Pay
      if (window.PaymentRequest) {
        const request = new PaymentRequest(
          [{
            supportedMethods: 'https://apple.com/apple-pay',
            data: {
              version: 3,
              merchantIdentifier: 'merchant.com.vantage.app',
              merchantCapabilities: ['supports3DS'],
              supportedNetworks: ['visa', 'masterCard', 'amex'],
              countryCode: 'AE',
            }
          }],
          {
            total: {
              label: pack?.name || 'Vantage AI Tokens',
              amount: { currency: 'AED', value: pack?.priceAED.toString() || '0' }
            }
          }
        );
        
        const canMakePayment = await request.canMakePayment();
        if (canMakePayment) {
          const response = await request.show();
          await response.complete('success');
          await grantTokens(selectedPack);
          return;
        }
      }
      console.log('Apple Pay not available. Simulating purchase for testing.');
      await grantTokens(selectedPack);
    } catch (err: any) {
      console.error('Apple Pay purchase failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStandardPurchase = async () => {
    if (!selectedPack) return;
    setIsProcessing(true);
    // Simulate standard credit card processing or redirect to Stripe checkout
    setTimeout(() => {
      grantTokens(selectedPack).finally(() => setIsProcessing(false));
    }, 1500);
  };`;

content = content.replace(targetLogic, replacementLogic);

const targetAppleButton = `                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-black text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-900 transition-colors font-['Google_Sans']"
                  >`;
const replacementAppleButton = `                  <button
                    onClick={handleApplePayPurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-black text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-900 transition-colors font-['Google_Sans']"
                  >`;
content = content.replace(targetAppleButton, replacementAppleButton);

const targetGoogleButton = `                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-[#008744] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#007038] transition-colors font-['Google_Sans']"
                  >`;
const replacementGoogleButton = `                  <button
                    onClick={handleGooglePlayPurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-[#008744] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#007038] transition-colors font-['Google_Sans']"
                  >`;
content = content.replace(targetGoogleButton, replacementGoogleButton);

const targetCardButton = `                  <button
                    onClick={handlePurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-white border border-neutral-200 text-neutral-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors font-['Google_Sans'] mt-2"
                  >`;
const replacementCardButton = `                  <button
                    onClick={handleStandardPurchase}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-white border border-neutral-200 text-neutral-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors font-['Google_Sans'] mt-2"
                  >`;
content = content.replace(targetCardButton, replacementCardButton);

fs.writeFileSync(file, content);
