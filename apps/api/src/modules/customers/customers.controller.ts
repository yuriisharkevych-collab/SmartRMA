import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { SearchCustomersDto } from './dto/search-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerEntity } from './entities/customer.entity';

/**
 * RBAC.md §"Customers / Products / Orders" zna wyłącznie `customers.view`
 * (przeglądanie ORAZ wyszukiwanie — jedno uprawnienie), `customers.create`,
 * `customers.edit`. Brak `customers.deactivate` — patrz `CustomersService`
 * i raport końcowy Zadania 13 (Customer nie ma pola `active`).
 */
@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({
    summary: 'Lista/wyszukiwanie klientów firmy',
    description: 'Bez `query` — pełna lista firmy. Z `query` — wyszukiwanie po nazwisku/telefonie/e-mailu (BR-011 dokumentu źródłowego, przy rejestracji reklamacji).',
  })
  @ApiResponse({ status: 200, description: 'Lista klientów.', type: [CustomerEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `customers.view`.' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchCustomersDto): Promise<CustomerEntity[]> {
    return query.query
      ? this.customersService.searchCustomers(user.companyId, query.query)
      : this.customersService.listCustomers(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Szczegóły klienta' })
  @ApiResponse({ status: 200, description: 'Klient znaleziony.', type: CustomerEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono klienta (brak dedykowanego kodu CUSTOMER-* w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `customers.view`.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerEntity> {
    return this.customersService.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_CREATE)
  @ApiOperation({
    summary: 'Rejestracja nowego klienta',
    description: 'Brak automatycznej deduplikacji po e-mailu/telefonie (DATABASE.md §10, świadome uproszczenie) — użyj wyszukiwania (GET /customers?query=) przed utworzeniem.',
  })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({ status: 201, description: 'Klient utworzony.', type: CustomerEntity })
  @ApiResponse({ status: 422, description: 'VALIDATION-001/002 — pola wymagane / nieprawidłowy format e-maila.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `customers.create`.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto): Promise<CustomerEntity> {
    return this.customersService.createCustomer(user.companyId, dto, user.userId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_EDIT)
  @ApiOperation({ summary: 'Edycja danych klienta' })
  @ApiBody({ type: UpdateCustomerDto })
  @ApiResponse({ status: 200, description: 'Klient zaktualizowany.', type: CustomerEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono klienta (brak dedykowanego kodu CUSTOMER-* w ERROR_CODES.md).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `customers.edit`.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerEntity> {
    return this.customersService.updateCustomer(id, dto, user.userId);
  }
}
