export type FormFieldType = 
  | 'text' 
  | 'textarea' 
  | 'radio' 
  | 'checkbox' 
  | 'select' 
  | 'email' 
  | 'number' 
  | 'date';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[];
}

export interface Form {
  id: number;
  title: string;
  description?: string;
  fields: FormField[];
  isOpen: boolean;
  confirmationMessage?: string;
  sendEmailConfirmation: boolean;
  notifyAdminEmail?: string;
  requirePayment?: boolean;
  paymentAmount?: number;
  paymentIban?: string;
  paymentMessage?: string;
  allowMultipleSubmissions?: boolean;
  werkjaar?: string;
  createdAt: string;
  updatedAt?: string;
  submissionCount?: number;
}

export interface FormSubmission {
  id: number;
  formId: number;
  data: Record<string, any>;
  respondentEmail?: string | null;
  isPaid?: boolean;
  paidAt?: string | null;
  paymentNotes?: string;
  drankBijdrage?: number;
  createdAt: string;
}

export const REINAERTLAND_GROUPS = [
  'Sint-Agnes, Stekene',
  'Sint-Andreas, Stekene',
  'Alleman, Sinaai',
  'Wij, Sinaai',
  'Hermelinde, Kemzeke',
  'Juventa, Kemzeke',
  'Judocus, Verrebroek',
  'Saleghem, Meerdonk',
  'Inter-Jeugdig, De Klinge',
];
