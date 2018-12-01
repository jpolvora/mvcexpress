function renameFunction (fn, name) {
  return Function('fn', 'return (function ' + name + '(){\n  return fn.apply(this, arguments)\n});')(fn);
}

function toCamelCase (str) {
  const [first, ...acc] = str.replace(/[^\w\d]/g, ' ').split(/\s+/);
  return first.toLowerCase() + acc.map(x => x.charAt(0).toUpperCase() +
        x.slice(1).toLowerCase()).join('');
}

module.exports = {
  renameFunction,
  toCamelCase
};
