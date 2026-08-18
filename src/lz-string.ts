const fromCharCode = String.fromCharCode;
const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const baseReverse = new Map<string, Map<string, number>>();

type IntReader = (value: number) => string;
type AlphabetReader = (index: number) => number;

function getBaseValue(alphabet: string, character: string): number {
  let lookup = baseReverse.get(alphabet);
  if (lookup === undefined) {
    lookup = new Map<string, number>();
    for (let index = 0; index < alphabet.length; index += 1) {
      lookup.set(alphabet.charAt(index), index);
    }
    baseReverse.set(alphabet, lookup);
  }
  return lookup.get(character) ?? 0;
}

function compress(uncompressed: string, bitsPerChar: number, getCharFromInt: IntReader): string {
  if (uncompressed === "") return "";
  const dictionary: Record<string, number> = {};
  const dictionaryToCreate: Record<string, boolean> = {};
  let contextC = "";
  let contextW = "";
  let contextWC = "";
  let contextEnlargeIn = 2;
  let contextDictSize = 3;
  let contextNumBits = 2;
  const contextData: string[] = [];
  let contextDataVal = 0;
  let contextDataPosition = 0;
  const pushBit = (bit: number): void => {
    contextDataVal = (contextDataVal << 1) | bit;
    if (contextDataPosition === bitsPerChar - 1) {
      contextDataPosition = 0;
      contextData.push(getCharFromInt(contextDataVal));
      contextDataVal = 0;
      return;
    }
    contextDataPosition += 1;
  };
  const writeBits = (width: number, rawValue: number): void => {
    let value = rawValue;
    for (let index = 0; index < width; index += 1) {
      pushBit(value & 1);
      value >>= 1;
    }
  };
  const emit = (value: string): void => {
    if (dictionaryToCreate[value]) {
      const code = value.charCodeAt(0);
      if (code < 256) {
        writeBits(contextNumBits, 0);
        writeBits(8, code);
      } else {
        writeBits(contextNumBits, 1);
        writeBits(16, code);
      }
      contextEnlargeIn -= 1;
      if (contextEnlargeIn === 0) {
        contextEnlargeIn = 2 ** contextNumBits;
        contextNumBits += 1;
      }
      delete dictionaryToCreate[value];
      return;
    }
    writeBits(contextNumBits, dictionary[value] ?? 0);
  };
  for (let index = 0; index < uncompressed.length; index += 1) {
    contextC = uncompressed.charAt(index);
    if (dictionary[contextC] === undefined) {
      dictionary[contextC] = contextDictSize;
      contextDictSize += 1;
      dictionaryToCreate[contextC] = true;
    }
    contextWC = contextW + contextC;
    if (dictionary[contextWC] !== undefined) {
      contextW = contextWC;
      continue;
    }
    emit(contextW);
    contextEnlargeIn -= 1;
    if (contextEnlargeIn === 0) {
      contextEnlargeIn = 2 ** contextNumBits;
      contextNumBits += 1;
    }
    dictionary[contextWC] = contextDictSize;
    contextDictSize += 1;
    contextW = String(contextC);
  }
  if (contextW !== "") {
    emit(contextW);
    contextEnlargeIn -= 1;
    if (contextEnlargeIn === 0) {
      contextEnlargeIn = 2 ** contextNumBits;
      contextNumBits += 1;
    }
  }
  writeBits(contextNumBits, 2);
  while (true) {
    contextDataVal <<= 1;
    if (contextDataPosition === bitsPerChar - 1) {
      contextData.push(getCharFromInt(contextDataVal));
      break;
    }
    contextDataPosition += 1;
  }
  return contextData.join("");
}

function decompress(
  length: number,
  resetValue: number,
  getNextValue: AlphabetReader,
): string | null {
  const dictionary: string[] = [];
  let next = 0;
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  const result: string[] = [];
  let bits = 0;
  let resb = 0;
  let maxpower = 0;
  let power = 0;
  let c = "";
  let dataVal = getNextValue(0);
  let dataPosition = resetValue;
  let dataIndex = 1;
  for (let index = 0; index < 3; index += 1) dictionary[index] = String(index);
  const readBits = (width: number): number => {
    bits = 0;
    maxpower = 2 ** width;
    power = 1;
    while (power !== maxpower) {
      resb = dataVal & dataPosition;
      dataPosition >>= 1;
      if (dataPosition === 0) {
        dataPosition = resetValue;
        dataVal = getNextValue(dataIndex);
        dataIndex += 1;
      }
      if (resb > 0) bits |= power;
      power <<= 1;
    }
    return bits;
  };
  next = readBits(2);
  switch (next) {
    case 0:
      c = fromCharCode(readBits(8));
      break;
    case 1:
      c = fromCharCode(readBits(16));
      break;
    case 2:
      return "";
    default:
      break;
  }
  dictionary[3] = c;
  let word = c;
  result.push(c);
  while (true) {
    if (dataIndex > length) return "";
    let code = readBits(numBits);
    if (code === 0) {
      dictionary[dictSize] = fromCharCode(readBits(8));
      code = dictSize;
      dictSize += 1;
      enlargeIn -= 1;
    } else if (code === 1) {
      dictionary[dictSize] = fromCharCode(readBits(16));
      code = dictSize;
      dictSize += 1;
      enlargeIn -= 1;
    } else if (code === 2) {
      return result.join("");
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }
    if (dictionary[code] !== undefined) {
      entry = dictionary[code] ?? "";
    } else if (code === dictSize) {
      entry = word + word.charAt(0);
    } else {
      return null;
    }
    result.push(entry);
    dictionary[dictSize] = word + entry.charAt(0);
    dictSize += 1;
    enlargeIn -= 1;
    word = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }
  }
}

export function compressToBase64(input: string): string {
  if (input === "") return "";
  const result = compress(input, 6, (value) => keyStrBase64.charAt(value));
  switch (result.length % 4) {
    case 0:
      return result;
    case 1:
      return `${result}===`;
    case 2:
      return `${result}==`;
    default:
      return `${result}=`;
  }
}

export function decompressFromBase64(input: string): string | null {
  if (input === "") return null;
  return decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)));
}
