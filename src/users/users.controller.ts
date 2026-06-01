import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponse } from './interfaces/user-response.interface';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('circuits/:circuitId/users')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.create(circuitId, dto);
  }

  @Get('circuits/:circuitId/users')
  async findByCircuit(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<UserResponse>> {
    return this.usersService.findByCircuit(circuitId, query.page ?? 1, query.limit ?? 20);
  }

  @Get('users/:id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<UserResponse> {
    return this.usersService.findOne(id, userCircuitId);
  }

  @Patch('users/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<UserResponse> {
    return this.usersService.update(id, dto, userCircuitId);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('circuitId') userCircuitId: string): Promise<void> {
    return this.usersService.remove(id, userCircuitId);
  }
}
