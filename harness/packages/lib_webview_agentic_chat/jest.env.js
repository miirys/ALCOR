global.setImmediate = global.setImmediate || ((fn, ...args) => global.setTimeout(fn, 0, ...args));

// Mock Performance API methods for testing
const performanceEntries = [];

performance.mark = jest.fn((name, options = {}) => {
  const mark = {
    name,
    entryType: 'mark',
    startTime: performance.now(),
    duration: 0,
    detail: options.detail || {},
  };
  performanceEntries.push(mark);
  return mark;
});

performance.measure = jest.fn((name, startOrOptions, endMark) => {
  const options =
    typeof startOrOptions === 'string' ? { start: startOrOptions, end: endMark } : startOrOptions;
  const startEntry = performanceEntries.find((e) => e.name === options.start);
  const endEntry = performanceEntries.find((e) => e.name === options.end);
  const startTime = startEntry?.startTime || 0;
  const endTime = endEntry?.startTime || performance.now();

  const measure = {
    name,
    entryType: 'measure',
    startTime,
    duration: endTime - startTime,
    detail: options.detail || {},
  };

  performanceEntries.push(measure);

  return measure;
});

performance.getEntriesByName = jest.fn((name, type) => {
  return performanceEntries.filter(
    (entry) => entry.name === name && (!type || entry.entryType === type),
  );
});

performance.clearMarks = jest.fn((name) => {
  if (name) {
    for (let i = performanceEntries.length - 1; i >= 0; i -= 1) {
      if (performanceEntries[i].name === name && performanceEntries[i].entryType === 'mark') {
        performanceEntries.splice(i, 1);
      }
    }
  } else {
    for (let i = performanceEntries.length - 1; i >= 0; i -= 1) {
      if (performanceEntries[i].entryType === 'mark') {
        performanceEntries.splice(i, 1);
      }
    }
  }
});

performance.clearMeasures = jest.fn((name) => {
  if (name) {
    for (let i = performanceEntries.length - 1; i >= 0; i -= 1) {
      if (performanceEntries[i].name === name && performanceEntries[i].entryType === 'measure') {
        performanceEntries.splice(i, 1);
      }
    }
  } else {
    for (let i = performanceEntries.length - 1; i >= 0; i -= 1) {
      if (performanceEntries[i].entryType === 'measure') {
        performanceEntries.splice(i, 1);
      }
    }
  }
});

if (!performance.timeOrigin) {
  Object.defineProperty(performance, 'timeOrigin', {
    value: Date.now(),
    writable: false,
    configurable: true,
  });
}
