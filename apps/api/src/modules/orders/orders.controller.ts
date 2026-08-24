import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrderDto } from './dto/find-order.dto';
import { SearchOrdersDto } from './dto/search-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderEntity } from './entities/order.entity';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  @ApiOperation({
    summary: 'Lista/wyszukiwanie zamówień firmy',
    description:
      'Bez `query` — pełna lista. Z `query` — wyszukiwanie po numerze zamówienia (dopasowanie częściowe, nie ORDER-001).',
  })
  @ApiResponse({ status: 200, description: 'Lista zamówień.', type: [OrderEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `orders.view`.' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchOrdersDto,
  ): Promise<OrderEntity[]> {
    return query.query
      ? this.ordersService.searchOrders(user.companyId, query.query)
      : this.ordersService.listOrders(user.companyId);
  }

  /**
   * Odpowiednik "wyszukiwania zamówienia po numerze" z kreatora (WORKFLOW.md
   * §6 poz. 12). Zwraca `null`, nie 404 — brak trafienia to oczekiwany
   * przepływ (ORDER-001). `@Res({ passthrough: true })` + `res.json()`
   * jawnie, zamiast `return null` — Nest traktuje zwrócone `null` tak samo
   * jak `undefined` (`isNil`) i wtedy wysyła PUSTĄ odpowiedź (Content-Length:
   * 0), nie JSON `null`; klient dostałby nieparsowalne ciało zamiast
   * udokumentowanego `null` (wykryte przy naprawie e2e po Status Workflow
   * Refactor — brak jeszcze wołającego z frontendu, więc nie regresja UI).
   */
  @Get('search')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW, PERMISSIONS.CASES_CREATE)
  @ApiOperation({
    summary: 'Wyszukanie zamówienia po dokładnym numerze (kreator zgłoszenia)',
    description: 'ORDER-001 — brak trafienia to informacyjny wynik (`null`, HTTP 200), nie błąd.',
  })
  @ApiResponse({ status: 200, description: 'Zamówienie znalezione lub `null`.', type: OrderEntity })
  @ApiResponse({
    status: 403,
    description: 'RBAC-001 — brak uprawnienia `orders.view`/`cases.create`.',
  })
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindOrderDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const order = await this.ordersService.findByOrderNumber(user.companyId, query.orderNumber);
    res.json(order);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  @ApiOperation({ summary: 'Szczegóły zamówienia (wraz z pozycjami)' })
  @ApiResponse({ status: 200, description: 'Zamówienie znalezione.', type: OrderEntity })
  @ApiResponse({
    status: 404,
    description:
      'Nie znaleziono zamówienia (brak dedykowanego kodu — ORDER-001 dotyczy wyłącznie wyszukiwania po numerze).',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `orders.view`.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderEntity> {
    return this.ordersService.findById(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDERS_MANAGE)
  @ApiOperation({
    summary: 'Import/utworzenie zamówienia wraz z pozycjami',
    description: 'Weryfikuje istnienie `customerId`/`shopId`/`OrderItem.productId` przed zapisem.',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Zamówienie utworzone.', type: OrderEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono `customerId`/`shopId`/`productId`.' })
  @ApiResponse({
    status: 409,
    description: 'ORDER-002 — numer zamówienia już istnieje w tej firmie.',
  })
  @ApiResponse({
    status: 422,
    description: 'VALIDATION-001 — pola wymagane / pusta lista pozycji.',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `orders.manage`.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderEntity> {
    return this.ordersService.createOrder(user.companyId, dto, user.userId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_MANAGE)
  @ApiOperation({
    summary: 'Edycja zamówienia',
    description:
      'Edytuje wyłącznie pola na poziomie Order — edycja pozycji (`OrderItem`) nie jest obsługiwana (patrz `UpdateOrderDto`).',
  })
  @ApiBody({ type: UpdateOrderDto })
  @ApiResponse({ status: 200, description: 'Zamówienie zaktualizowane.', type: OrderEntity })
  @ApiResponse({ status: 404, description: 'Nie znaleziono zamówienia/`customerId`/`shopId`.' })
  @ApiResponse({
    status: 409,
    description: 'ORDER-002 — nowy numer zamówienia już istnieje w tej firmie.',
  })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `orders.manage`.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderEntity> {
    return this.ordersService.updateOrder(id, user.companyId, dto, user.userId);
  }
}
