import { McpContext, McpController, Tool } from "@rekog/mcp-nest";
import { BalanceService } from "./balance.service";
import { Ctx, Payload } from "@nestjs/microservices";
import z from "zod";

@McpController()
export class BalanceMcpController {
  constructor(
    private readonly balance: BalanceService
  ) {}

  @Tool({
    name: 'get_balance',
    description: 'Get the current balance of the user',
  })
  getBalance(
    @Ctx() ctx: McpContext,
  ) {
    console.log(ctx);
    return {
      content: [{
        type: 'text',
        text: `Current balance: ${this.balance.getBalance()}`,
      }],
    };
  }

  @Tool({
    name: 'add_balance',
    description: 'Add balance to the user account',
    parameters: z.object({
      amount: z.number().min(0),
    }),
  })
  addBalance(
    @Payload() { amount }: { amount: number },
    @Ctx() ctx: McpContext,
  ) {
    console.log(ctx);
    this.balance.addBalance(amount);
    return {
      content: [{
        type: 'text',
        text: `Added ${amount} to balance. New balance: ${this.balance.getBalance()}`,
      }],
    };
  }

  @Tool({
    name: 'subtract_balance',
    description: 'Subtract balance from the user account',
    parameters: z.object({
      amount: z.number().min(0),
    }),
  })
  subtractBalance(
    @Payload() { amount }: { amount: number },
    @Ctx() ctx: McpContext,
  ) {
    console.log(ctx);
    this.balance.subtractBalance(amount);
    return {
      content: [{
        type: 'text',
        text: `Subtracted ${amount} from balance. New balance: ${this.balance.getBalance()}`,
      }],
    };
  }
}
