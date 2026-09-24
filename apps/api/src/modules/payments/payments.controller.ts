import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { DevPaymentSimulateDto } from './dto/dev-payment-simulate.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@Roles('CUSTOMER')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('verify')
  verify(@CurrentUser() user: RequestUser, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(dto.paymentId, user.sub);
  }

  @Post('dev/simulate')
  simulate(@CurrentUser() user: RequestUser, @Body() dto: DevPaymentSimulateDto) {
    return this.paymentsService.simulateDev(user.sub, dto.providerPaymentId, dto.outcome);
  }
}
