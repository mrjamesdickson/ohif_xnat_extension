import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseNumberArray,
  parseFloatValue,
  parseFloatValues,
  parseTemporalPosition,
  parseImageId,
  getSequenceItem,
} from '../src/XNATImageLoader.utils.js';

test('parseNumberArray converts DICOM backslash strings into numeric arrays', () => {
  assert.deepEqual(parseNumberArray('1.0\\2\\-3.5'), [1, 2, -3.5]);
});

test('parseNumberArray returns null for missing or non-numeric values', () => {
  assert.equal(parseNumberArray(undefined), null);
  assert.equal(parseNumberArray('abc'), null);
});

test('parseFloatValue safely parses numeric strings', () => {
  assert.equal(parseFloatValue('42.5'), 42.5);
  assert.equal(parseFloatValue(''), null);
  assert.equal(parseFloatValue(undefined), null);
});

test('parseFloatValues normalises arrays and strings', () => {
  assert.deepEqual(parseFloatValues(['1', '2.5']), [1, 2.5]);
  assert.deepEqual(parseFloatValues('3\\4'), [3, 4]);
  assert.equal(parseFloatValues(null), null);
});

test('parseImageId handles xnat scheme with frame query parameter', () => {
  const { url, frameIndex } = parseImageId('xnat:https://example/dicom.dcm?token=abc&frame=7');
  assert.equal(url, 'https://example/dicom.dcm?token=abc');
  assert.equal(frameIndex, 7);
});

test('parseImageId defaults frame index when missing', () => {
  const { url, frameIndex } = parseImageId('xnat:https://example/dicom.dcm');
  assert.equal(url, 'https://example/dicom.dcm');
  assert.equal(frameIndex, 0);
});

test('getSequenceItem returns the first item in a DICOM sequence', () => {
  const innerDataSet = { value: 123 };
  const sequence = {
    elements: {
      x00100010: {
        items: [
          { dataSet: innerDataSet },
        ],
      },
    },
  };

  assert.strictEqual(getSequenceItem(sequence, 'x00100010'), innerDataSet);
  assert.equal(getSequenceItem(sequence, 'x0020000D'), null);
});

test('parseTemporalPosition extracts frame index and frame time when present', () => {
  const frameContentDataSet = {
    intString: (tag) => (tag === 'x00209128' ? '3' : null),
  };
  const perFrameDataSet = {
    elements: {
      x00209111: {
        items: [
          { dataSet: frameContentDataSet },
        ],
      },
    },
  };
  const perFrameFunctionalGroups = {
    items: [
      { dataSet: perFrameDataSet },
    ],
  };
  const dataSet = {
    floatString: (tag) => (tag === 'x00181063' ? 45.5 : null),
  };

  const result = parseTemporalPosition(dataSet, perFrameFunctionalGroups, 0);
  assert.deepEqual(result, { temporalPositionIndex: '3', frameTime: 45.5 });
});

test('parseTemporalPosition falls back when no frame content is available', () => {
  const perFrameFunctionalGroups = { items: [] };
  const dataSet = {
    floatString: () => undefined,
  };

  const result = parseTemporalPosition(dataSet, perFrameFunctionalGroups, 0);
  assert.deepEqual(result, { temporalPositionIndex: null, frameTime: null });
});
