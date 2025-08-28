
export async function renderReportWithFormat(formatId, data) {
  let module;
  try {
    if (formatId === 0) {
      module = await import('./default.js');
    } else {
      module = await import(`./f${formatId}.js`);
    }
  } catch (e) {
    module = await import('./default.js');
  }
  return module.default(data);
}
