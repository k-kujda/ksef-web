import { KSeFEnvironment, MAX_DATE_RANGE_DAYS } from './constants';
import {
  encryptKsefToken,
  generateEncryptionData,
  EncryptionData,
  decryptAes,
  encryptInvoice,
  sha256Base64,
} from './crypto';
import JSZip from 'jszip';

export interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  subjectType: string;
  dateIssue?: string;
  dateInvoicing?: string;
  sellerName?: string;
  sellerNip?: string;
  buyerName?: string;
  buyerNip?: string;
  netAmount?: string;
  vatAmount?: string;
  grossAmount?: string;
  currency: string;
}

export interface ExportStatus {
  referenceNumber: string;
  status: string;
  packageParts: Array<{ url: string }>;
  isTruncated: boolean;
}

export interface InvoiceSubmissionResult {
  sessionReferenceNumber: string;
  invoiceReferenceNumber: string;
  sessionClosed: boolean;
}

export class KSeFClient {
  private baseUrl: string;
  private nip: string;
  private ksefToken: string;
  private timeout: number;
  private accessToken?: string;
  private corsProxyUrl?: string;

  constructor(
    environment: KSeFEnvironment,
    nip: string,
    ksefToken: string,
    timeout: number = 30000,
    corsProxyUrl?: string
  ) {
    this.baseUrl = environment;
    this.nip = nip;
    this.ksefToken = ksefToken;
    this.timeout = timeout;
    this.corsProxyUrl = corsProxyUrl;
  }

  private getUrl(path: string): string {
    if (this.corsProxyUrl) {
      return `${this.corsProxyUrl}${path}`;
    }
    return `${this.baseUrl}${path}`;
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = this.getUrl(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers = new Headers(options.headers);
    if (this.corsProxyUrl) {
      headers.set('X-KSeF-Base-Url', this.baseUrl);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async authenticate(): Promise<void> {
    const challengeResp = await this.request('/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const challenge = await challengeResp.json();

    const tokenEncryption = await encryptKsefToken(
      this.baseUrl,
      this.ksefToken,
      challenge.timestampMs,
      this.corsProxyUrl
    );

    const authResp = await this.request('/auth/ksef-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge: challenge.challenge,
        contextIdentifier: {
          type: 'Nip',
          value: this.nip,
        },
        encryptedToken: tokenEncryption.encryptedToken,
        publicKeyId: tokenEncryption.publicKeyId,
      }),
    });
    const authData = await authResp.json();

    await this.pollAuthStatus(authData.referenceNumber, authData.authenticationToken.token);

    const tokensResp = await this.request('/auth/token/redeem', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.authenticationToken.token}`,
      },
    });
    const tokens = await tokensResp.json();

    this.accessToken = tokens.accessToken.token;
  }

  private async pollAuthStatus(refNumber: string, authToken: string, maxWait: number = 60): Promise<void> {
    const deadline = Date.now() + maxWait * 1000;
    
    while (Date.now() < deadline) {
      const resp = await this.request(`/auth/${refNumber}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const data = await resp.json();
      const code = data.status?.code || 0;
      
      if (code === 200) return;
      if (code >= 400) {
        throw new Error(`Authentication failed: ${JSON.stringify(data.status)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Authentication polling timed out');
  }

  async getInvoice(ksefNumber: string): Promise<string> {
    if (!this.accessToken) throw new Error('Not authenticated');
    
    const resp = await this.request(`/invoices/ksef/${ksefNumber}`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
    });
    return await resp.text();
  }

  async submitInvoice(invoiceXml: string): Promise<InvoiceSubmissionResult> {
    if (!this.accessToken) throw new Error('Not authenticated');

    const encryption = await generateEncryptionData(this.baseUrl, this.corsProxyUrl);
    const openResponse = await this.request('/sessions/online', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        formCode: {
          systemCode: 'FA (3)',
          schemaVersion: '1-0E',
          value: 'FA',
        },
        encryption: {
          encryptedSymmetricKey: encryption.encryptedSymmetricKey,
          initializationVector: encryption.initializationVector,
        },
      }),
    });
    const session = await openResponse.json();
    const sessionReferenceNumber = session.referenceNumber as string;

    let invoiceReferenceNumber: string;
    try {
      const invoiceBytes = new TextEncoder().encode(invoiceXml);
      const encryptedBytes = await encryptInvoice(
        invoiceBytes,
        encryption.cipherKey,
        encryption.cipherIv
      );
      const sendResponse = await this.request(
        `/sessions/online/${encodeURIComponent(sessionReferenceNumber)}/invoices`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoiceHash: await sha256Base64(invoiceBytes),
            invoiceSize: invoiceBytes.byteLength,
            encryptedInvoiceHash: await sha256Base64(encryptedBytes),
            encryptedInvoiceSize: encryptedBytes.byteLength,
            encryptedInvoiceContent: this.bytesToBase64(encryptedBytes),
            offlineMode: false,
          }),
        }
      );
      const submitted = await sendResponse.json();
      invoiceReferenceNumber = submitted.referenceNumber as string;
    } catch (error) {
      // Closing is best-effort here; preserve the original send error so the UI
      // never reports a session-close problem as a failed invoice upload.
      try {
        await this.closeOnlineSession(sessionReferenceNumber);
      } catch {
        // The original submission error remains the actionable failure.
      }
      throw error;
    }

    try {
      await this.closeOnlineSession(sessionReferenceNumber);
      return {
        sessionReferenceNumber,
        invoiceReferenceNumber,
        sessionClosed: true,
      };
    } catch {
      // The invoice was already accepted. Report that fact and avoid inviting
      // a duplicate retry merely because closing the session failed.
      return {
        sessionReferenceNumber,
        invoiceReferenceNumber,
        sessionClosed: false,
      };
    }
  }

  private async closeOnlineSession(sessionReferenceNumber: string): Promise<void> {
    await this.request(
      `/sessions/online/${encodeURIComponent(sessionReferenceNumber)}/close`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      }
    );
  }

  async listInvoices(
    dateFrom: string,
    dateTo: string,
    subjectType: string = 'Subject1',
    dateType: string = 'Issue',
    pageSize: number = 10,
    pageOffset: number = 0
  ): Promise<{ items: InvoiceMetadata[]; total: number }> {
    if (!this.accessToken) throw new Error('Not authenticated');
    
    this.validateDateRange(dateFrom, dateTo);
    
    const query = new URLSearchParams({
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
      sortOrder: 'Asc',
    });
    const resp = await this.request(`/invoices/query/metadata?${query}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subjectType,
        dateRange: {
          dateType,
          from: dateFrom,
          to: dateTo,
        },
      }),
    });
    
    const data = await resp.json();
    const items: InvoiceMetadata[] = (data.invoices || []).map((inv: any) => ({
      ksefNumber: inv.ksefNumber || '',
      invoiceNumber: inv.invoiceNumber || '',
      subjectType: inv.subjectType || '',
      dateIssue: inv.dateIssue,
      dateInvoicing: inv.dateInvoicing,
      sellerName: inv.sellerName,
      sellerNip: inv.sellerNip,
      buyerName: inv.buyerName,
      buyerNip: inv.buyerNip,
      netAmount: inv.netAmount,
      vatAmount: inv.vatAmount,
      grossAmount: inv.grossAmount,
      currency: inv.currency || 'PLN',
    }));
    
    return { items, total: data.totalCount || 0 };
  }

  async listAllInvoices(
    dateFrom: string,
    dateTo: string,
    subjectType: string = 'Subject1',
    dateType: string = 'Issue',
    pageSize: number = 250
  ): Promise<InvoiceMetadata[]> {
    const invoices: InvoiceMetadata[] = [];
    let pageOffset = 0;

    while (true) {
      const page = await this.listInvoices(
        dateFrom,
        dateTo,
        subjectType,
        dateType,
        pageSize,
        pageOffset
      );
      invoices.push(...page.items);

      if (page.items.length === 0 || invoices.length >= page.total) break;
      pageOffset += 1;
    }

    return invoices;
  }

  async exportInvoices(
    dateFrom: string,
    dateTo: string,
    subjectType: string = 'Subject1',
    dateType: string = 'PermanentStorage'
  ): Promise<{ referenceNumber: string; encryptionData: EncryptionData }> {
    if (!this.accessToken) throw new Error('Not authenticated');
    
    this.validateDateRange(dateFrom, dateTo);
    
    const encryptionData = await generateEncryptionData(this.baseUrl, this.corsProxyUrl);
    
    const resp = await this.request('/invoices/exports', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-KSeF-Feature': 'include-metadata',
      },
      body: JSON.stringify({
        filters: {
          subjectType,
          dateRange: {
            dateType,
            from: dateFrom,
            restrictToPermanentStorageHwmDate: true,
          },
        },
        encryption: {
          encryptedSymmetricKey: encryptionData.encryptedSymmetricKey,
          initializationVector: encryptionData.initializationVector,
          publicKeyId: encryptionData.publicKeyId,
        },
      }),
    });
    
    const data = await resp.json();
    return { referenceNumber: data.referenceNumber, encryptionData };
  }

  async getExportStatus(referenceNumber: string): Promise<ExportStatus> {
    if (!this.accessToken) throw new Error('Not authenticated');
    
    const resp = await this.request(`/invoices/exports/${referenceNumber}`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
    });
    
    const data = await resp.json();
    const pkg = data.packageParts || data.package || {};
    const parts = Array.isArray(pkg) ? pkg : (pkg.parts || []);
    
    return {
      referenceNumber,
      status: typeof data.status === 'string' ? data.status : (data.status?.description || 'unknown'),
      packageParts: parts,
      isTruncated: data.isTruncated || false,
    };
  }

  async pollExport(referenceNumber: string, maxWait: number = 300): Promise<ExportStatus> {
    const deadline = Date.now() + maxWait * 1000;
    
    while (Date.now() < deadline) {
      const status = await this.getExportStatus(referenceNumber);
      
      const s = status.status.toLowerCase();
      if (s.includes('completed') || s.includes('done') || s.includes('200') ||
          s.includes('sukcesem') || s.includes('zakończony')) {
        return status;
      }
      
      if (s.includes('failed') || s.includes('error') || s.includes('błąd')) {
        throw new Error(`Export failed: ${status.status}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Export polling timed out');
  }

  async downloadExport(
    referenceNumber: string,
    encryptionData: EncryptionData
  ): Promise<{ invoices: Record<string, string>; metadata: any[] }> {
    const status = await this.pollExport(referenceNumber);
    
    const decryptedParts: Uint8Array[] = [];
    for (const part of status.packageParts) {
      if (!part.url) continue;

      const resp = this.corsProxyUrl
        ? await fetch(`${this.corsProxyUrl}/_package`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: part.url }),
          })
        : await fetch(part.url);

      if (!resp.ok) {
        const message = await resp.text();
        throw new Error(`Package download failed (HTTP ${resp.status}): ${message}`);
      }

      const encrypted = new Uint8Array(await resp.arrayBuffer());
      const decrypted = await decryptAes(encrypted, encryptionData.cipherKey, encryptionData.cipherIv);
      decryptedParts.push(decrypted);
    }
    
    const merged = new Uint8Array(decryptedParts.reduce((acc, part) => acc + part.length, 0));
    let offset = 0;
    for (const part of decryptedParts) {
      merged.set(part, offset);
      offset += part.length;
    }
    
    const zip = await JSZip.loadAsync(merged);
    const invoices: Record<string, string> = {};
    let metadata: any[] = [];
    
    for (const [name, file] of Object.entries(zip.files)) {
      const content = await file.async('string');
      if (name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        metadata = parsed.invoices || [];
      } else if (name.endsWith('.xml')) {
        invoices[name] = content;
      }
    }
    
    return { invoices, metadata };
  }

  private validateDateRange(dateFrom: string, dateTo: string): void {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const days = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    
    if (days > MAX_DATE_RANGE_DAYS) {
      throw new Error(`Date range must not exceed ${MAX_DATE_RANGE_DAYS} days (got ${days} days)`);
    }
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
