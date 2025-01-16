import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Divider
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import EditIcon from '@mui/icons-material/Edit';

const CVEHistory = ({ history = [] }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
    <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <HistoryIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="h6" color="primary.main">
          변경 이력
        </Typography>
      </Box>
      <List>
        {history.length > 0 ? (
          history.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <Divider component="li" />}
              <ListItem alignItems="flex-start">
                <ListItemIcon>
                  <EditIcon color="action" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography component="span" variant="subtitle2">
                        {formatDate(item.timestamp)}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <PersonIcon sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {item.modifiedBy}
                        </Typography>
                      </Box>
                    </Box>
                  }
                  secondary={
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.primary"
                      sx={{ display: 'block', mt: 1 }}
                    >
                      {item.changes.map((change, idx) => (
                        <Box key={idx} sx={{ mb: 0.5 }}>
                          • {change}
                        </Box>
                      ))}
                    </Typography>
                  }
                />
              </ListItem>
            </React.Fragment>
          ))
        ) : (
          <ListItem>
            <ListItemText
              primary={
                <Typography color="text.secondary">
                  변경 이력이 없습니다.
                </Typography>
              }
            />
          </ListItem>
        )}
      </List>
    </Paper>
  );
};

export default CVEHistory;
