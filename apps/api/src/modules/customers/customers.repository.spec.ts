import { PrismaService } from '../../prisma/prisma.service';
import { CustomersRepository } from './customers.repository';

describe('CustomersRepository', () => {
  let prisma: {
    customer: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let repository: CustomersRepository;

  beforeEach(() => {
    prisma = {
      customer: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    repository = new CustomersRepository(prisma as unknown as PrismaService);
  });

  it('findById() filtruje po id i companyId (IDOR — patrz audyt bezpieczeństwa)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await repository.findById('customer-1', 'company-1');
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-1', companyId: 'company-1' },
    });
  });

  it('findAllByCompany() filtruje po companyId i sortuje od najnowszych', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    await repository.findAllByCompany('company-1');
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('search() filtruje po companyId oraz OR po lastName/phone/email (case-insensitive dla tekstu)', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    await repository.search('company-1', 'kowalski');
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        OR: [
          { lastName: { contains: 'kowalski', mode: 'insensitive' } },
          { phone: { contains: 'kowalski' } },
          { email: { contains: 'kowalski', mode: 'insensitive' } },
        ],
      },
      take: 50,
    });
  });

  it('create() dowiązuje companyId do danych klienta', async () => {
    prisma.customer.create.mockResolvedValue({});
    await repository.create('company-1', {
      firstName: 'Jan',
      lastName: 'Kowalski',
      phone: '600000000',
    });
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: { firstName: 'Jan', lastName: 'Kowalski', phone: '600000000', companyId: 'company-1' },
    });
  });

  it('update() przekazuje dane wprost do prisma.customer.update', async () => {
    prisma.customer.update.mockResolvedValue({});
    await repository.update('customer-1', { lastName: 'Nowak' });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: { lastName: 'Nowak' },
    });
  });
});
