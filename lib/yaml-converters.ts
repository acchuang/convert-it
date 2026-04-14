import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

export function yamlToJson(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = yamlParse(text);
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  });
}

export function jsonToYaml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    const yaml = yamlStringify(data, { lineWidth: 0 });
    return new Blob([yaml], { type: 'application/yaml' });
  });
}