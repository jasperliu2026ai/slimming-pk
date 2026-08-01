import { z } from 'zod';

export function weightKgSchema(minKg: number) {
  return z
    .number({
      invalid_type_error: '体重必须是数字',
      required_error: '请输入体重',
    })
    .finite('体重必须是合法数字')
    .min(minKg, `体重不能低于 ${minKg}kg`)
    .max(300, '体重不能高于 300kg')
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      '体重最多保留两位小数',
    );
}
