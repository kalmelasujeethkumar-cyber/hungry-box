import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Login ID is required' })
  @MaxLength(320)
  loginId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
