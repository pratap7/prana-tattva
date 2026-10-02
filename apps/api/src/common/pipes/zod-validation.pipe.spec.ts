import { ZodValidationPipe } from './zod-validation.pipe';
import { z } from 'zod';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(2),
    age: z.number().int().positive(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('should pass through valid values', () => {
    const validData = { name: 'Patanjali', age: 40 };
    const result = pipe.transform(validData, { type: 'body' });
    expect(result).toEqual(validData);
  });

  it('should throw ZodError for invalid inputs', () => {
    const invalidData = { name: 'A', age: -5 };
    expect(() => pipe.transform(invalidData, { type: 'body' })).toThrow();
  });
});
