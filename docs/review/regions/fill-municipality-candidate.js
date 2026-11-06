// Review candidate for the municipality selector in areas.js.
window.fillMunicipalitySelect = function(el, pref, selected = '') {
  if (!pref) {
    el.replaceChildren(new Option('先に都道府県を選択', ''));
    el.disabled = true;
    return;
  }
  const choices = [pref + '全域', ...(SPODORA_AREAS[pref] || [])];
  if (selected && !choices.includes(selected)) choices.push(selected);
  el.replaceChildren(...choices.map(value => new Option(value, value, false, value === selected)));
  el.disabled = false;
};
