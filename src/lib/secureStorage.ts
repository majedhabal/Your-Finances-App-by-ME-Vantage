import CryptoJS from 'crypto-js';

function getDeviceSecret(): string {
  let secret = localStorage.getItem('vantage_device_cipher_salt');
  if (!secret) {
    try {
      const array = new Uint8Array(32);
      window.crypto.getRandomValues(array);
      secret = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('vantage_device_cipher_salt', secret);
    } catch (e) {
      secret = 'vantage-fallback-device-salt-2026';
    }
  }
  return 'vantage-secure-app-key-' + secret;
}

export function secureSave(key: string, data: any): void {
  try {
    const jsonString = JSON.stringify(data);
    const ciphertext = CryptoJS.AES.encrypt(jsonString, getDeviceSecret()).toString();
    localStorage.setItem(key, ciphertext);
  } catch (err) {
    console.warn('[SecureStorage] Error saving encrypted data for key:', key, err);
  }
}

export function secureLoad(key: string, fallback: any = null): any {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;

    try {
      const bytes = CryptoJS.AES.decrypt(raw, getDeviceSecret());
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
      if (decryptedString) {
        return JSON.parse(decryptedString);
      }
    } catch (decryptErr) {
      // Not encrypted
    }

    try {
      const parsed = JSON.parse(raw);
      secureSave(key, parsed);
      return parsed;
    } catch (jsonErr) {
      return fallback;
    }
  } catch (err) {
    console.warn('[SecureStorage] Error loading encrypted data for key:', key, err);
    return fallback;
  }
}
