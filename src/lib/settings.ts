import { KSeFEnvironment } from './ksef/constants';
import { getItem, setItem } from './storage';

export interface AppSettings {
  environment: KSeFEnvironment;
  nip: string;
  ksefToken: string;
  corsProxyUrl?: string;
}

const SETTINGS_KEY = 'ksef_settings';

const defaultSettings: AppSettings = {
  environment: KSeFEnvironment.TEST,
  nip: '',
  ksefToken: '',
};

export function loadSettings(): AppSettings {
  return getItem(SETTINGS_KEY, defaultSettings);
}

export function saveSettings(settings: AppSettings): void {
  setItem(SETTINGS_KEY, settings);
}
