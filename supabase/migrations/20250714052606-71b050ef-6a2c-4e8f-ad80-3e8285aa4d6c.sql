-- Add account_type column to google_accounts table
ALTER TABLE public.google_accounts 
ADD COLUMN account_type TEXT DEFAULT 'backup' CHECK (account_type IN ('primary', 'backup'));

-- Add shared_folder_id to track the created shared folder in backup accounts
ALTER TABLE public.google_accounts 
ADD COLUMN shared_folder_id TEXT;

-- Create index for account_type
CREATE INDEX idx_google_accounts_account_type ON public.google_accounts(account_type);

-- Update existing accounts to set the first account as primary if any exist
UPDATE public.google_accounts 
SET account_type = 'primary' 
WHERE id IN (
  SELECT DISTINCT ON (user_id) id 
  FROM public.google_accounts 
  ORDER BY user_id, created_at ASC
);