import React, { useEffect, useState } from 'react';
import { formatMetersMm, parseFlexibleDecimal, roundToMm } from '../utils/calculations';

interface MillimeterInputProps {
  id?: string;
  ariaLabel?: string;
  dataTestId?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  precision?: 0 | 1 | 2 | 3 | 4 | 5;
  className?: string;
  placeholder?: string;
  title?: string;
  onChange: (nextValue: number) => void;
}

/**
 * Universal numeric input supporting 1mm (0.001m) precision and accepting dot ('.'),
 * comma (','), or Russian keyboard layout equivalents ('ю', 'б', '/') regardless of active layout.
 */
export const MillimeterInput: React.FC<MillimeterInputProps> = ({
  id,
  ariaLabel,
  dataTestId,
  value,
  min,
  max,
  step = 0.001,
  precision = 3,
  className = '',
  placeholder,
  title,
  onChange
}) => {
  const formatVal = (v: number) => {
    if (!Number.isFinite(v)) return '0';
    if (precision === 5) return String(Math.round(v * 100000) / 100000);
    if (precision === 4) return String(Math.round(v * 10000) / 10000);
    if (precision === 2) return String(Math.round(v * 100) / 100);
    if (precision === 1) return String(Math.round(v * 10) / 10);
    if (precision === 0) return String(Math.round(v));
    return formatMetersMm(v);
  };

  const [text, setText] = useState<string>(() => formatVal(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setText(formatVal(value));
    }
  }, [value, isFocused, precision]);

  const roundByPrecision = (n: number) => {
    if (precision === 5) return Math.round(n * 100000) / 100000;
    if (precision === 4) return Math.round(n * 10000) / 10000;
    if (precision === 2) return Math.round(n * 100) / 100;
    if (precision === 1) return Math.round(n * 10) / 10;
    if (precision === 0) return Math.round(n);
    return roundToMm(n);
  };

  const commitParsed = (rawStr: string, clampBounds: boolean) => {
    const parsed = parseFlexibleDecimal(rawStr);
    if (parsed === null) return;
    let next = roundByPrecision(parsed);
    if (clampBounds) {
      if (typeof min === 'number') next = Math.max(min, next);
      if (typeof max === 'number') next = Math.min(max, next);
    }
    onChange(next);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      data-testid={dataTestId}
      value={text}
      placeholder={placeholder}
      title={title || 'Точность до 1 мм (0.001 м). Можно вводить через точку или запятую в любой раскладке'}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = parseFlexibleDecimal(raw);
        if (parsed !== null) {
          let next = roundByPrecision(parsed);
          if (typeof min === 'number' && next < min) {
            // Allow typing intermediate digits before blurring, unless valid >= min
            if (min <= 0 || next >= min) {
              if (typeof max === 'number') next = Math.min(max, next);
              onChange(next);
            }
          } else {
            if (typeof max === 'number') next = Math.min(max, next);
            onChange(next);
          }
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseFlexibleDecimal(text);
        if (parsed === null) {
          setText(formatVal(value));
          return;
        }
        let next = roundByPrecision(parsed);
        if (typeof min === 'number') next = Math.max(min, next);
        if (typeof max === 'number') next = Math.min(max, next);
        onChange(next);
        setText(formatVal(next));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commitParsed(text, true);
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = (e.shiftKey ? step * 100 : step) * (e.key === 'ArrowUp' ? 1 : -1);
          const base = parseFlexibleDecimal(text) ?? value;
          let next = roundByPrecision(base + delta);
          if (typeof min === 'number') next = Math.max(min, next);
          if (typeof max === 'number') next = Math.min(max, next);
          onChange(next);
          setText(formatVal(next));
        }
      }}
      className={className}
    />
  );
};
