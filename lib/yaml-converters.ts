import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { ConversionSettings } from './types';

export function yamlToJson(file: File, _s: string, _t: string, settings?: ConversionSettings): Promise<Blob> {
  const indent = settings?.jsonIndent ?? 2;
  return file.text().then(text => {
    const data = yamlParse(text);
    const json = indent === 0
      ? JSON.stringify(data)
      : JSON.stringify(data, null, indent);
    return new Blob([json], { type: 'application/json' });
  });
}

export function jsonToYaml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    const yaml = yamlStringify(data, { lineWidth: 0 });
    return new Blob([yaml], { type: 'application/yaml' });
  });
}
