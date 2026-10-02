import { PipeTransform, ArgumentMetadata, Injectable } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema?: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (this.schema) {
      return this.schema.parse(value);
    }

    const targetSchema = (metadata.metatype as unknown as { zodSchema?: ZodSchema })?.zodSchema;
    if (targetSchema) {
      return targetSchema.parse(value);
    }

    return value;
  }
}

export function validateWithZod<T>(schema: ZodSchema<T>): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}
