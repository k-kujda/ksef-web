export const TNS = 'http://crd.gov.pl/wzor/2025/06/25/13775/';
export const ETD = 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/';
export const XSI = 'http://www.w3.org/2001/XMLSchema-instance';

export const NSMAP = {
  '': TNS,
  'etd': ETD,
  'xsi': XSI,
};

export enum KSeFEnvironment {
  TEST = 'https://api-test.ksef.mf.gov.pl/v2',
  DEMO = 'https://api-demo.ksef.mf.gov.pl/v2',
  PROD = 'https://api.ksef.mf.gov.pl/v2',
}

export const MAX_DATE_RANGE_DAYS = 90;
