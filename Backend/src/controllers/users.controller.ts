import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes } from '../utils/appError.js';
import {
  findUserByUsername,
  toPublicUserSearchResult,
} from '../services/currentUserService.js';
import type { ApiSuccessBody } from '../types/api.js';

export async function searchUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const username = req.query.username;
    if (typeof username !== 'string' || !username.trim()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'username is required',
      });
    }
    const user = await findUserByUsername(username);
    if (!user || !user.username) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'No Splitzy user found with this username',
      });
    }
    const body: ApiSuccessBody<{ id: string; username: string; name: string }> = {
      success: true,
      data: toPublicUserSearchResult(user),
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}