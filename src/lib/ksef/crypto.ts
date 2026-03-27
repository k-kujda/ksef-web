export interface EncryptionData {
  cipherKey: Uint8Array;
  cipherIv: Uint8Array;
  encryptedSymmetricKey: string;
  initializationVector: string;
}

export async function fetchPublicKey(baseUrl: string, usage: string): Promise<CryptoKey> {
  const response = await fetch(`${baseUrl}/security/public-key-certificates`);
  const certs = await response.json();
  
  for (const cert of certs) {
    if (cert.usage && cert.usage.includes(usage)) {
      const certDer = base64ToArrayBuffer(cert.certificate);
      const certObj = await importCertificate(certDer);
      return certObj;
    }
  }
  
  throw new Error(`No public key certificate found with usage=${usage}`);
}

async function importCertificate(certDer: ArrayBuffer): Promise<CryptoKey> {
  const certPem = arrayBufferToPem(certDer, 'CERTIFICATE');
  const publicKeyDer = await extractPublicKeyFromCert(certPem);
  
  return await crypto.subtle.importKey(
    'spki',
    publicKeyDer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );
}

function arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const base64 = arrayBufferToBase64(buffer);
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

async function extractPublicKeyFromCert(certPem: string): Promise<ArrayBuffer> {
  const certLines = certPem.split('\n').filter(line => 
    !line.includes('BEGIN') && !line.includes('END')
  ).join('');
  const certDer = base64ToArrayBuffer(certLines);
  
  const asn1 = parseAsn1Certificate(new Uint8Array(certDer));
  return asn1.publicKey as ArrayBuffer;
}

function parseAsn1Certificate(der: Uint8Array): { publicKey: ArrayBuffer } {
  let offset = 0;
  
  const readLength = (): number => {
    const firstByte = der[offset++];
    if (firstByte < 128) return firstByte;
    const numBytes = firstByte & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | der[offset++];
    }
    return length;
  };
  
  const skipTag = () => {
    offset++;
    const length = readLength();
    return length;
  };
  
  skipTag();
  skipTag();
  skipTag();
  skipTag();
  skipTag();
  skipTag();
  
  offset++;
  const pubKeyLen = readLength();
  offset++;
  
  const pubKeyStart = offset;
  const pubKeyEnd = offset + pubKeyLen - 1;
  
  return {
    publicKey: der.slice(pubKeyStart, pubKeyEnd).buffer
  };
}

export async function generateEncryptionData(baseUrl: string): Promise<EncryptionData> {
  const cipherKey = crypto.getRandomValues(new Uint8Array(32));
  const cipherIv = crypto.getRandomValues(new Uint8Array(16));
  
  const publicKey = await fetchPublicKey(baseUrl, 'SymmetricKeyEncryption');
  
  const encryptedKey = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    cipherKey
  );
  
  return {
    cipherKey,
    cipherIv,
    encryptedSymmetricKey: arrayBufferToBase64(encryptedKey),
    initializationVector: arrayBufferToBase64(cipherIv.buffer as ArrayBuffer),
  };
}

export async function encryptKsefToken(
  baseUrl: string,
  ksefToken: string,
  timestampMs: number
): Promise<string> {
  const tokenPlain = `${ksefToken}|${timestampMs}`;
  const tokenBytes = new TextEncoder().encode(tokenPlain);
  
  const publicKey = await fetchPublicKey(baseUrl, 'KsefTokenEncryption');
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    tokenBytes
  );
  
  return arrayBufferToBase64(encrypted);
}

export async function encryptInvoice(
  invoiceXml: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );
  
  const padded = pkcs7Pad(invoiceXml, 16);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    cryptoKey,
    padded as BufferSource
  );
  
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return result;
}

export async function decryptAes(
  data: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  let ciphertext = data;
  
  if (data.length >= 16 && arraysEqual(data.slice(0, 16), iv)) {
    ciphertext = data.slice(16);
  }
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    cryptoKey,
    ciphertext as BufferSource
  );
  
  return pkcs7Unpad(new Uint8Array(decrypted));
}

function pkcs7Pad(data: Uint8Array, blockSize: number): Uint8Array {
  const paddingLength = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + paddingLength);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) {
    padded[i] = paddingLength;
  }
  return padded;
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  const paddingLength = data[data.length - 1];
  return data.slice(0, data.length - paddingLength);
}

export function sha256Base64(data: Uint8Array): Promise<string> {
  return crypto.subtle.digest('SHA-256', data as BufferSource).then(hash => 
    arrayBufferToBase64(hash)
  );
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
