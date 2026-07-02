import { describe, it, expect } from 'vitest';
import { yamlToJson, jsonToYaml, yamlToCsv, yamlToXml, yamlToTsv } from '@/lib/yaml-converters';
import { DEFAULT_SETTINGS } from '@/lib/types';

const YAML = 'name: Alice\nage: 30';

describe('yamlToJson', () => {
  it('parses simple YAML into JSON', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToJson(file, 'yaml', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual({ name: 'Alice', age: 30 });
  });

  it('respects jsonIndent setting of 0 (minified)', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToJson(file, 'yaml', 'json', { ...DEFAULT_SETTINGS, jsonIndent: 0 });
    const text = await blob.text();
    expect(text).not.toContain('\n');
  });

  it('parses nested objects and arrays', async () => {
    const yaml = 'person:\n  name: Alice\n  hobbies:\n    - reading\n    - hiking';
    const file = new File([yaml], 'nested.yaml', { type: 'application/yaml' });
    const blob = await yamlToJson(file, 'yaml', 'json', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual({
      person: { name: 'Alice', hobbies: ['reading', 'hiking'] },
    });
  });
});

describe('jsonToYaml', () => {
  it('converts JSON object into YAML', async () => {
    const json = JSON.stringify({ name: 'Alice', age: 30 });
    const file = new File([json], 'test.json', { type: 'application/json' });
    const blob = await jsonToYaml(file, 'json', 'yaml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('name: Alice');
    expect(text).toContain('age: 30');
  });
});

describe('yaml <-> json round trip', () => {
  it('preserves data through yamlToJson then jsonToYaml', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const jsonBlob = await yamlToJson(file, 'yaml', 'json', DEFAULT_SETTINGS);
    const jsonText = await jsonBlob.text();

    const jsonFile = new File([jsonText], 'test.json', { type: 'application/json' });
    const yamlBlob = await jsonToYaml(jsonFile, 'json', 'yaml', DEFAULT_SETTINGS);
    const yamlText = await yamlBlob.text();

    expect(yamlText).toContain('name: Alice');
    expect(yamlText).toContain('age: 30');
  });
});

describe('yamlToCsv', () => {
  it('converts a YAML mapping into a single-row CSV', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToCsv(file, 'yaml', 'csv', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('name');
    expect(text).toContain('Alice');
  });

  it('converts a YAML list of mappings into multi-row CSV', async () => {
    const yaml = '- name: Alice\n  age: 30\n- name: Bob\n  age: 25';
    const file = new File([yaml], 'list.yaml', { type: 'application/yaml' });
    const blob = await yamlToCsv(file, 'yaml', 'csv', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('respects custom csvDelimiter setting', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToCsv(file, 'yaml', 'csv', { ...DEFAULT_SETTINGS, csvDelimiter: ';' });
    const text = await blob.text();
    expect(text).toContain('name;age');
  });
});

describe('yamlToXml', () => {
  it('wraps YAML mapping in default root element', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToXml(file, 'yaml', 'xml', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('<root>');
    expect(text).toContain('<name>Alice</name>');
  });

  it('respects custom xmlRootElement setting', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToXml(file, 'yaml', 'xml', { ...DEFAULT_SETTINGS, xmlRootElement: 'person' });
    const text = await blob.text();
    expect(text).toContain('<person>');
    expect(text).toContain('</person>');
  });
});

describe('yamlToTsv', () => {
  it('converts YAML mapping into TSV', async () => {
    const file = new File([YAML], 'test.yaml', { type: 'application/yaml' });
    const blob = await yamlToTsv(file, 'yaml', 'tsv', DEFAULT_SETTINGS);
    const text = await blob.text();
    expect(text).toContain('name\tage');
    expect(text).toContain('Alice');
  });
});

describe('invalid YAML syntax', () => {
  it('documents actual behavior for malformed YAML input', async () => {
    // Tab characters are illegal for indentation in YAML and cause the
    // 'yaml' library's parser to throw a YAMLParseError.
    const badYaml = 'name: Alice\n\tage: 30';
    const file = new File([badYaml], 'bad.yaml', { type: 'application/yaml' });
    await expect(yamlToJson(file, 'yaml', 'json', DEFAULT_SETTINGS)).rejects.toThrow();
  });
});
