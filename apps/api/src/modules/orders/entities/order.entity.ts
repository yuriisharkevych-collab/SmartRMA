import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemEntity {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() quantity!: number;
  @ApiPropertyOptional({ nullable: true }) unitPrice!: string | null;
  @ApiPropertyOptional({ nullable: true }) serialNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) frameNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) invoiceNumber!: string | null;
}

export class OrderEntity {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiPropertyOptional({ nullable: true }) shopId!: string | null;
  @ApiProperty() customerId!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() orderDate!: Date;
  @ApiPropertyOptional({ nullable: true }) totalAmount!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [OrderItemEntity] }) items!: OrderItemEntity[];
}
