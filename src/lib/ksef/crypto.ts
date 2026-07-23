export interface EncryptionData {
  cipherKey: Uint8Array;
  cipherIv: Uint8Array;
  encryptedSymmetricKey: string;
  initializationVector: string;
  publicKeyId?: string;
}

interface PublicKeyData {
  key: CryptoKey;
  publicKeyId?: string;
}

export async function fetchPublicKey(
  baseUrl: string,
  usage: string,
  corsProxyUrl?: string
): Promise<PublicKeyData> {
  const response = await fetch(
    corsProxyUrl
      ? `${corsProxyUrl}/security/public-key-certificates`
      : `${baseUrl}/security/public-key-certificates`,
    corsProxyUrl
      ? { headers: { 'X-KSeF-Base-Url': baseUrl } }
      : undefined
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch KSeF public certificates (HTTP ${response.status})`);
  }

  const certs = await response.json();
  
  for (const cert of certs) {
    if (cert.usage && cert.usage.includes(usage)) {
      const certDer = base64ToArrayBuffer(cert.certificate);
      const key = await importCertificate(certDer);
      return { key, publicKeyId: cert.publicKeyId };
    }
  }
  
  throw new Error(`No public key certificate found with usage=${usage}`);
}

async function importCertificate(certDer: ArrayBuffer): Promise<CryptoKey> {
  const publicKeyDer = extractPublicKeyFromCert(certDer);
  
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

function extractPublicKeyFromCert(certDer: ArrayBuffer): ArrayBuffer {
  return parseAsn1Certificate(new Uint8Array(certDer));
}

interface DerNode {
  tag: number;
  start: number;
  valueStart: number;
  end: number;
}

function readDerNode(der: Uint8Array, start: number): DerNode {
  if (start < 0 || start + 2 > der.length) {
    throw new Error('Invalid X.509 certificate');
  }

  const tag = der[start];
  let cursor = start + 1;
  const firstLengthByte = der[cursor++];
  let length: number;

  if ((firstLengthByte & 0x80) === 0) {
    length = firstLengthByte;
  } else {
    const lengthBytes = firstLengthByte & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4 || cursor + lengthBytes > der.length) {
      throw new Error('Invalid X.509 certificate length');
    }

    length = 0;
    for (let i = 0; i < lengthBytes; i++) {
      length = length * 256 + der[cursor++];
    }
  }

  const end = cursor + length;
  if (end > der.length) throw new Error('Truncated X.509 certificate');

  return { tag, start, valueStart: cursor, end };
}

function parseAsn1Certificate(der: Uint8Array): ArrayBuffer {
  const certificate = readDerNode(der, 0);
  if (certificate.tag !== 0x30) throw new Error('Invalid X.509 certificate sequence');

  const tbsCertificate = readDerNode(der, certificate.valueStart);
  if (tbsCertificate.tag !== 0x30) throw new Error('Invalid X.509 TBSCertificate');

  let cursor = tbsCertificate.valueStart;
  let node = readDerNode(der, cursor);

  // Version is an optional context-specific [0] field.
  if (node.tag === 0xa0) {
    cursor = node.end;
  }

  // Skip serialNumber, signature, issuer, validity and subject.
  for (let i = 0; i < 5; i++) {
    node = readDerNode(der, cursor);
    cursor = node.end;
  }

  const subjectPublicKeyInfo = readDerNode(der, cursor);
  if (subjectPublicKeyInfo.tag !== 0x30) {
    throw new Error('X.509 certificate has no SubjectPublicKeyInfo');
  }

  return der.slice(subjectPublicKeyInfo.start, subjectPublicKeyInfo.end).buffer;
}

export async function generateEncryptionData(
  baseUrl: string,
  corsProxyUrl?: string
): Promise<EncryptionData> {
  const cipherKey = crypto.getRandomValues(new Uint8Array(32));
  const cipherIv = crypto.getRandomValues(new Uint8Array(16));
  
  const publicKey = await fetchPublicKey(baseUrl, 'SymmetricKeyEncryption', corsProxyUrl);
  
  const encryptedKey = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey.key,
    cipherKey
  );
  
  return {
    cipherKey,
    cipherIv,
    encryptedSymmetricKey: arrayBufferToBase64(encryptedKey),
    initializationVector: arrayBufferToBase64(cipherIv.buffer as ArrayBuffer),
    publicKeyId: publicKey.publicKeyId,
  };
}

export async function encryptKsefToken(
  baseUrl: string,
  ksefToken: string,
  timestampMs: number,
  corsProxyUrl?: string
): Promise<{ encryptedToken: string; publicKeyId?: string }> {
  const tokenPlain = `${ksefToken}|${timestampMs}`;
  const tokenBytes = new TextEncoder().encode(tokenPlain);
  
  const publicKey = await fetchPublicKey(baseUrl, 'KsefTokenEncryption', corsProxyUrl);
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey.key,
    tokenBytes
  );
  
  return {
    encryptedToken: arrayBufferToBase64(encrypted),
    publicKeyId: publicKey.publicKeyId,
  };
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
