import React from 'react';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot
} from '@mui/lab';
import { Typography, Box } from '@mui/material';
import { formatDate } from '../../../utils/dateUtils';

const HistoryTab = ({ cve }) => {
  // modificationHistory를 CVE 객체에서 직접 사용
  const history = cve.modificationHistory || [];

  return (
    <Box sx={{ p: 2 }}>
      <Timeline>
        {history.map((item, index) => (
          <TimelineItem key={index}>
            <TimelineSeparator>
              <TimelineDot color="primary" />
              {index < history.length - 1 && <TimelineConnector />}
            </TimelineSeparator>
            <TimelineContent>
              <Typography variant="subtitle2" color="text.primary">
                {formatDate(item.dateModified)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {item.description}
              </Typography>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
    </Box>
  );
};

export default HistoryTab; 