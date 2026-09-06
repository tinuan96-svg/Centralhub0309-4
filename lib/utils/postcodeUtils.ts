/**
 * DHL eCommerce UK (UK Mail) Zone Mapping Utility
 */

export type DHLZone = 'A' | 'B' | 'C' | 'D';

export interface PostcodeAnalysis {
  zone: DHLZone;
  isIsleOfWight: boolean;
  isHighlands: boolean;
  isIslands: boolean;
  isNorthernIreland: boolean;
}

/**
 * Determines the DHL Zone and other characteristics from a UK postcode
 * based on standard carrier pricing zones.
 */
export function analyzePostcode(postcode: string): PostcodeAnalysis {
  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  const area = cleanPostcode.match(/^[A-Z]{1,2}/)?.[0] || '';
  const districtMatch = cleanPostcode.match(/^[A-Z]{1,2}(\d{1,2})/);
  const district = districtMatch ? parseInt(districtMatch[1]) : 0;

  let zone: DHLZone = 'A';
  let isIsleOfWight = false;
  let isHighlands = false;
  let isIslands = false;
  let isNorthernIreland = false;

  // Northern Ireland
  if (area === 'BT') {
    zone = 'C';
    isNorthernIreland = true;
  }
  // Isle of Man
  else if (area === 'IM') {
    zone = 'D';
    isIslands = true;
  }
  // Channel Islands
  else if (area === 'GY' || area === 'JE') {
    zone = 'D';
    isIslands = true;
  }
  // Isle of Wight
  else if (area === 'PO' && district >= 30 && district <= 41) {
    zone = 'A'; // Base zone is A, but has surcharge
    isIsleOfWight = true;
  }
  // Scottish Highlands (Zone B)
  else if (
    (area === 'AB' && district >= 31) ||
    (area === 'FK' && district >= 17 && district <= 21) ||
    (area === 'IV' && (district <= 39 || district === 52 || district === 54 || district === 63)) ||
    (area === 'KW' && district <= 14) ||
    (area === 'PA' && district >= 21 && district <= 40) ||
    (area === 'PH' && (district >= 19 && district <= 26 || district >= 30 && district <= 41 || district >= 49))
  ) {
    zone = 'B';
    isHighlands = true;
  }
  // Scottish Islands (Zone C)
  else if (
    (area === 'HS') ||
    (area === 'IV' && (district >= 40 && district <= 51 || district >= 55 && district <= 56)) ||
    (area === 'KA' && (district === 27 || district === 28)) ||
    (area === 'KW' && district >= 15) ||
    (area === 'PA' && (district === 20 || district >= 41)) ||
    (area === 'PH' && district >= 42 && district <= 44) ||
    (area === 'ZE')
  ) {
    zone = 'C';
    isIslands = true;
  }
  // Scilly Isles
  else if (area === 'TR' && district >= 21 && district <= 25) {
    zone = 'C';
    isIslands = true;
  }

  return {
    zone,
    isIsleOfWight,
    isHighlands,
    isIslands,
    isNorthernIreland
  };
}

/**
 * Checks if a postcode is in the London Congestion Zone
 * (Very basic check for central London districts)
 */
export function isLondonCongestionZone(postcode: string): boolean {
  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  const district = cleanPostcode.match(/^[A-Z]{1,2}\d[A-Z]?/)?.[0] || '';

  const congestionDistricts = [
    'EC1', 'EC2', 'EC3', 'EC4',
    'WC1', 'EC2',
    'W1', 'SW1', 'SE1', 'SE11'
  ];

  return congestionDistricts.some(d => district.startsWith(d));
}
