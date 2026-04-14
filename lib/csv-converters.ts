import Papa from 'papaparse';

export function csvToJson(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    return new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
  });
}

export function csvToTsv(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const tsv = result.data.map(row => row.join('\t')).join('\n');
    return new Blob([tsv], { type: 'text/tab-separated-values' });
  });
}

export function csvToXml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = result.data.map(row => {
      const fields = Object.entries(row)
        .map(([k, v]) => `    <${k}>${v ?? ''}</${k}>`)
        .join('\n');
      return `  <row>\n${fields}\n  </row>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<data>\n${rows.join('\n')}\n</data>`;
    return new Blob([xml], { type: 'application/xml' });
  });
}

export function csvToHtml(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const headers = result.meta.fields ?? [];
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = result.data.map(row => {
      const cells = headers.map(h => `<td>${row[h] ?? ''}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');
    const html = `<!DOCTYPE html>\n<html>\n<body>\n<table border="1">\n${thead}\n<tbody>\n${tbody}\n</tbody>\n</table>\n</body>\n</html>`;
    return new Blob([html], { type: 'text/html' });
  });
}

export function tsvToCsv(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse(text, { header: false, delimiter: '\t', skipEmptyLines: true });
    const csv = Papa.unparse(result.data);
    return new Blob([csv], { type: 'text/csv' });
  });
}

export function tsvToJson(file: File): Promise<Blob> {
  return file.text().then(text => {
    const result = Papa.parse(text, { header: true, delimiter: '\t', skipEmptyLines: true, dynamicTyping: true });
    return new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
  });
}

export function jsonToCsv(file: File): Promise<Blob> {
  return file.text().then(text => {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    const csv = Papa.unparse(arr);
    return new Blob([csv], { type: 'text/csv' });
  });
}