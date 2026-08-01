import {
  calculateJewelryPrice,
  parseRequestedSizeFromText,
} from './pricing.rules';

describe('calculateJewelryPrice', () => {
  it('uses baseSize when no requestedSize is given', () => {
    // Arrange
    const input = {
      weightGrams: 3.2,
      laborCost: 120_000,
      baseSize: 6,
      sizeDeltaGrams: 0.15,
      requestedSize: null,
      silverPricePerGram: 28_000,
      marginRate: 0.25,
    };

    // Act
    const result = calculateJewelryPrice(input);

    // Assert
    expect(result.requestedSize).toBe(6);
    expect(result.weightAdjustedGrams).toBe(3.2);
    expect(result.materialCost).toBe(Math.round(3.2 * 28_000));
    expect(result.totalPrice).toBe(
      Math.round((result.materialCost + 120_000) * 1.25),
    );
  });

  it('adjusts weight up when requestedSize is larger than baseSize', () => {
    // Arrange
    const input = {
      weightGrams: 3.2,
      laborCost: 120_000,
      baseSize: 6,
      sizeDeltaGrams: 0.15,
      requestedSize: 8,
      silverPricePerGram: 28_000,
      marginRate: 0.25,
    };

    // Act
    const result = calculateJewelryPrice(input);

    // Assert
    const expectedWeight = 3.2 + (8 - 6) * 0.15;
    expect(result.weightAdjustedGrams).toBeCloseTo(expectedWeight, 5);
    expect(result.totalPrice).toBeGreaterThan(0);
  });

  it('adjusts weight down when requestedSize is smaller than baseSize', () => {
    // Arrange
    const input = {
      weightGrams: 4.1,
      laborCost: 180_000,
      baseSize: 6,
      sizeDeltaGrams: 0.18,
      requestedSize: 5,
      silverPricePerGram: 28_000,
      marginRate: 0.25,
    };

    // Act
    const result = calculateJewelryPrice(input);

    // Assert
    const expectedWeight = 4.1 + (5 - 6) * 0.18;
    expect(result.weightAdjustedGrams).toBeCloseTo(expectedWeight, 5);
    expect(result.weightAdjustedGrams).toBeLessThan(4.1);
  });
});

describe('parseRequestedSizeFromText', () => {
  it.each([
    ['Tôi muốn đặt nhẫn size 8 được không?', 8],
    ['Cho mình hỏi cỡ 7 giá bao nhiêu', 7],
    ['size7 giá thế nào', 7],
  ])('parses "%s" as size %i', (text, expected) => {
    expect(parseRequestedSizeFromText(text)).toBe(expected);
  });

  it('returns null when no size is mentioned', () => {
    expect(
      parseRequestedSizeFromText('Sản phẩm này còn hàng không?'),
    ).toBeNull();
  });
});
