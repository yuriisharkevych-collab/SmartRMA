import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class OrderItemDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() frameNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceNumber?: string;
}

/** `orders.manage`. ORDER-002 przy kolizji numeru w obrębie firmy (DATABASE.md §17). */
export class CreateOrderDto {
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() shopId?: string;
  @ApiProperty() @IsString() orderNumber!: string;
  @ApiProperty() @IsDateString() orderDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalAmount?: number;
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
