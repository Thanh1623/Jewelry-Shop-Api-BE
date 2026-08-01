export interface PricingInput {
  weightGrams: number;
  laborCost: number;
  baseSize: number;
  sizeDeltaGrams: number;
  requestedSize?: number | null;
  silverPricePerGram: number;
  marginRate: number;
}

export interface PricingBreakdown {
  requestedSize: number;
  baseSize: number;
  weightGrams: number;
  weightAdjustedGrams: number;
  silverPricePerGram: number;
  materialCost: number;
  laborCost: number;
  marginRate: number;
  totalPrice: number;
}

/**
 * weightAdjusted = weightGrams + (requestedSize - baseSize) * sizeDeltaGrams
 * material       = weightAdjusted * silverPricePerGram
 * total          = (material + laborCost) * (1 + marginRate)
 */
export function calculateJewelryPrice(input: PricingInput): PricingBreakdown {
  const requestedSize = input.requestedSize ?? input.baseSize;
  const weightAdjustedGrams =
    input.weightGrams + (requestedSize - input.baseSize) * input.sizeDeltaGrams;
  const materialCost = weightAdjustedGrams * input.silverPricePerGram;
  const totalPrice = (materialCost + input.laborCost) * (1 + input.marginRate);

  return {
    requestedSize,
    baseSize: input.baseSize,
    weightGrams: input.weightGrams,
    weightAdjustedGrams: roundTo2(weightAdjustedGrams),
    silverPricePerGram: input.silverPricePerGram,
    materialCost: Math.round(materialCost),
    laborCost: input.laborCost,
    marginRate: input.marginRate,
    totalPrice: Math.round(totalPrice),
  };
}

// Matches "size 7", "cỡ 8", "kích thước 9" etc. in a customer question.
const SIZE_PATTERN = /(?:size|cỡ|kich\s*thuoc|kích\s*thước)\D{0,3}(\d{1,2})/i;

export function parseRequestedSizeFromText(text: string): number | null {
  const match = SIZE_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export function buildTemplateExplanation(
  breakdown: PricingBreakdown,
  productName: string,
): string {
  const vnd = (value: number): string => `${value.toLocaleString('vi-VN')}đ`;

  return [
    `Báo giá cho "${productName}" (size ${breakdown.requestedSize}):`,
    `- Khối lượng bạc sau điều chỉnh size: ${breakdown.weightAdjustedGrams}g (gốc ${breakdown.weightGrams}g, size chuẩn ${breakdown.baseSize})`,
    `- Tiền bạc: ${breakdown.weightAdjustedGrams}g x ${vnd(breakdown.silverPricePerGram)}/g = ${vnd(breakdown.materialCost)}`,
    `- Tiền công chế tác: ${vnd(breakdown.laborCost)}`,
    `- Biên lợi nhuận: ${(breakdown.marginRate * 100).toFixed(0)}%`,
    `=> Tổng giá đề xuất: ${vnd(breakdown.totalPrice)}`,
  ].join('\n');
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}
