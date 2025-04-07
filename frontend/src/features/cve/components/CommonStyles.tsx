// CommonStyles.tsx
import { styled } from '@mui/material/styles';
import { Paper, Button, IconButton, Box, Theme } from '@mui/material';

export const StyledListItem = styled(Paper)(({ theme }: { theme: Theme }) => ({
  padding: '8px',
  marginBottom: '6px',
  backgroundColor: '#ffffff',
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  '& + &': {
    marginTop: '6px'
  },
  '& .MuiTypography-root': {
    fontSize: '0.75rem',
    lineHeight: 1.4
  },
  '& .MuiTypography-caption': {
    fontSize: '0.65rem'
  },
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows[2]
  }
}));

export const ActionButton = styled(Button)(({ theme }: { theme: Theme }) => ({
  textTransform: 'none',
  borderRadius: theme.shape.borderRadius,
  padding: '4px 12px',
  fontSize: '0.75rem',
  fontWeight: 500,
  '&.MuiButton-outlined': {
    borderColor: theme.palette.divider,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
      borderColor: theme.palette.text.primary
    }
  }
}));

export const ActionIconButton = styled(IconButton)(({ theme }: { theme: Theme }) => ({
  color: theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.primary
  }
}));

export const ListHeader = styled('div')(({ theme }: { theme: Theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing(2)
}));

export const ChipLabel = styled('span')(({ theme }: { theme: Theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  fontSize: '0.75rem'
}));

export const EmptyState = styled(Paper)(({ theme }: { theme: Theme }) => ({
  padding: theme.spacing(2),
  textAlign: 'center',
  borderRadius: theme.shape.borderRadius * 2,
  backgroundColor: '#ffffff',
  border: `1px dashed ${theme.palette.divider}`,
  color: theme.palette.text.secondary,
  '& .MuiTypography-root': {
    fontSize: '0.75rem'
  },
}));

export const TabContentContainer = styled(Box)(({ theme }: { theme: Theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden'
}));

export const TabContentScroll = styled(Box)(({ theme }: { theme: Theme }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: theme.spacing(1),
  '&::-webkit-scrollbar': {
    width: '6px',
    backgroundColor: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '3px',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.2)'
    }
  }
}));