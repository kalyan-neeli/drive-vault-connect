
-- Create enum for account status
CREATE TYPE account_status AS ENUM ('active', 'expired', 'revoked', 'error');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create google_accounts table for storing connected Google accounts
CREATE TABLE public.google_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  google_account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  total_storage BIGINT DEFAULT 0,
  used_storage BIGINT DEFAULT 0,
  status account_status DEFAULT 'active',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, google_account_id)
);

-- Create drive_files table for file metadata
CREATE TABLE public.drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  google_account_id UUID REFERENCES public.google_accounts(id) ON DELETE CASCADE NOT NULL,
  drive_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT DEFAULT 0,
  created_time TIMESTAMP WITH TIME ZONE,
  modified_time TIMESTAMP WITH TIME ZONE,
  download_url TEXT,
  thumbnail_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(google_account_id, drive_file_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS policies for google_accounts
CREATE POLICY "Users can view own google accounts" ON public.google_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own google accounts" ON public.google_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own google accounts" ON public.google_accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own google accounts" ON public.google_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for drive_files
CREATE POLICY "Users can view own drive files" ON public.drive_files
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own drive files" ON public.drive_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own drive files" ON public.drive_files
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own drive files" ON public.drive_files
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_google_accounts_user_id ON public.google_accounts(user_id);
CREATE INDEX idx_google_accounts_status ON public.google_accounts(status);
CREATE INDEX idx_drive_files_user_id ON public.drive_files(user_id);
CREATE INDEX idx_drive_files_google_account_id ON public.drive_files(google_account_id);
CREATE INDEX idx_drive_files_is_deleted ON public.drive_files(is_deleted);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at timestamps
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_accounts_updated_at
  BEFORE UPDATE ON public.google_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drive_files_updated_at
  BEFORE UPDATE ON public.drive_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
