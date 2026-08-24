import { Customer } from '@prisma/client';
import { CustomerEntity } from '../entities/customer.entity';

export class CustomerMapper {
  static toEntity(customer: Customer): CustomerEntity {
    const {
      id,
      companyId,
      firstName,
      lastName,
      phone,
      email,
      address,
      city,
      postalCode,
      notes,
      createdAt,
    } = customer;
    return {
      id,
      companyId,
      firstName,
      lastName,
      phone,
      email,
      address,
      city,
      postalCode,
      notes,
      createdAt,
    };
  }

  static toEntityList(customers: Customer[]): CustomerEntity[] {
    return customers.map(CustomerMapper.toEntity);
  }
}
