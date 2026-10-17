/** The authenticated member acting in a request. Every service call takes one. */
export type Actor = {
  userId: string;
  memberId: string;
  companyId: string;
  displayName: string;
  username: string;
  workerCode: string;
  isWorker: boolean;
  isManager: boolean;
  isAdmin: boolean;
  isIt: boolean;
  mustChangePin: boolean;
};
