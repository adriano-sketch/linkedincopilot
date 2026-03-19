-- Add suggested data columns to verticals
ALTER TABLE verticals
ADD COLUMN IF NOT EXISTS suggested_industries TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS suggested_keywords TEXT[] DEFAULT '{}';

-- Add generic_titles_no_filter to campaign_profiles
ALTER TABLE campaign_profiles
ADD COLUMN IF NOT EXISTS generic_titles_no_filter BOOLEAN DEFAULT FALSE;