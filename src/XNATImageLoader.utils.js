export function parseNumberArray(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parts = value
    .split('\\')
    .map(part => parseFloat(part))
    .filter(num => !Number.isNaN(num));
  return parts.length ? parts : null;
}

export function parseFloatValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseFloatValues(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const numbers = value.map(item => parseFloat(item)).filter(num => !Number.isNaN(num));
    return numbers.length ? numbers : null;
  }

  return parseNumberArray(value);
}

export function getSequenceItem(dataSet, tag) {
  const sequenceElement = dataSet?.elements?.[tag];
  if (!sequenceElement || !sequenceElement.items || !sequenceElement.items.length) {
    return null;
  }

  return sequenceElement.items[0]?.dataSet || null;
}

export function getFunctionalGroupValue({
  fallbackDataSet,
  sharedDataSet,
  perFrameDataSet,
  sequenceTag,
  valueTag,
  fallbackTag,
}) {
  const valueFromPerFrame = getSequenceItem(perFrameDataSet, sequenceTag)?.string?.(valueTag);
  if (valueFromPerFrame) {
    return valueFromPerFrame;
  }

  const valueFromShared = getSequenceItem(sharedDataSet, sequenceTag)?.string?.(valueTag);
  if (valueFromShared) {
    return valueFromShared;
  }

  if (fallbackTag && fallbackDataSet) {
    return fallbackDataSet.string(fallbackTag);
  }

  return null;
}

export function parseTemporalPosition(dataSet, perFrameFunctionalGroups, frameIndex) {
  const perFrameDataSet = perFrameFunctionalGroups?.items?.[frameIndex]?.dataSet;
  const frameContentItem = getSequenceItem(perFrameDataSet, 'x00209111'); // FrameContentSequence
  const temporalPosition = frameContentItem ? frameContentItem.intString('x00209128') : null;
  const frameTime = dataSet.floatString('x00181063') || null; // FrameTime

  return {
    temporalPositionIndex: temporalPosition,
    frameTime,
  };
}

export function parseImageId(imageId) {
  const raw = imageId.replace(/^xnat:/, '');

  try {
    const url = new URL(raw);
    const frameParam = url.searchParams.get('frame');
    const frame = frameParam !== null ? parseInt(frameParam, 10) : 0;
    url.searchParams.delete('frame');
    return {
      url: url.toString(),
      frameIndex: Number.isInteger(frame) && frame >= 0 ? frame : 0,
    };
  } catch (error) {
    const [base, query] = raw.split('?');
    let frameIndex = 0;
    if (query) {
      const params = new URLSearchParams(query);
      const frameParam = params.get('frame');
      if (frameParam) {
        const parsed = parseInt(frameParam, 10);
        if (Number.isInteger(parsed) && parsed >= 0) {
          frameIndex = parsed;
        }
      }
    }

    return {
      url: base,
      frameIndex,
    };
  }
}

export default {
  parseNumberArray,
  parseFloatValue,
  parseFloatValues,
  getSequenceItem,
  getFunctionalGroupValue,
  parseTemporalPosition,
  parseImageId,
};
