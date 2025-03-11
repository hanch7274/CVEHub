import React, { useState, useEffect, useCallback, useRef } from 'react';

const CVEDetail = ({ match }) => {
  const loadingRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!cveId) {
      log.error('CVE ID가 제공되지 않았습니다');
      setError('CVE ID가 제공되지 않았습니다');
      setLoading(false);
      return;
    }

    if (fetchInProgressRef.current) {
      log.debug(`fetchData: 이미 진행 중인 요청 있음 (cveId: ${cveId})`);
      return;
    }

    if (initialLoadDoneRef.current && cveCached) {
      log.debug(`fetchData: 이미 초기 로드 완료됨, 캐시된 데이터 사용 (cveId: ${cveId})`);
      return;
    }

    fetchInProgressRef.current = true;
    loadingRef.current = true;
    
    try {
      log.debug(`CVE 상세 정보 로드 시작 (cveId: ${cveId})`);
      setLoading(true);
      setError(null);

      if (!snackbarShown.current) {
        openSnackbar('데이터를 불러오는 중입니다...', 'info');
        snackbarShown.current = true;
      }

      const result = await dispatch(fetchCVEDetail({ 
        cveId, 
        ignoreDebounce: !initialLoadDoneRef.current
      })).unwrap();

      log.debug(`CVE 상세 정보 로드 완료 (cveId: ${cveId})`);
      
      initialLoadDoneRef.current = true;
      
      if (snackbarShown.current) {
        closeSnackbar();
        openSnackbar('데이터를 성공적으로 불러왔습니다', 'success');
        snackbarShown.current = false;
      }

      if (result && result.id) {
        subscribeToDetails(result.id);
      }
    } catch (error) {
      if (error?.isDuplicate && error?.hasCachedData) {
        log.info(`중복 요청이지만 캐시된 데이터 사용 (cveId: ${cveId})`);
        initialLoadDoneRef.current = true;
        
        if (snackbarShown.current) {
          closeSnackbar();
          snackbarShown.current = false;
        }
        setLoading(false);
        return;
      }
      
      log.error(`CVE 상세 정보 로드 실패 (cveId: ${cveId})`, error);
      setError(error?.message || '데이터 로딩 실패');
      
      if (snackbarShown.current) {
        closeSnackbar();
        openSnackbar('데이터 로딩 실패: ' + (error?.message || '알 수 없는 오류'), 'error');
        snackbarShown.current = false;
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
      fetchInProgressRef.current = false;
    }
  }, [cveId, dispatch, openSnackbar, closeSnackbar, cveCached, subscribeToDetails]);

  useEffect(() => {
    log.debug(`CVEDetail useEffect: cveId 변경 감지 (cveId: ${cveId})`);
    
    if (!cveId) return;
    
    initialLoadDoneRef.current = false;
    fetchInProgressRef.current = false;
    loadingRef.current = false;
    snackbarShown.current = false;
    
    fetchData();
    
    return () => {
      if (snackbarShown.current) {
        closeSnackbar();
        snackbarShown.current = false;
      }
      
      initialLoadDoneRef.current = false;
      fetchInProgressRef.current = false;
      loadingRef.current = false;
    };
  }, [cveId, fetchData, closeSnackbar]);

  const handleRefresh = useCallback(async () => {
    log.debug(`CVE 상세 정보 수동 새로고침 요청 (cveId: ${cveId})`);
    
    if (loadingRef.current) {
      log.debug('이미 로딩 중이므로 새로고침 무시');
      return;
    }
    
    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      
      openSnackbar('데이터를 새로고침 중입니다...', 'info');
      snackbarShown.current = true;
      
      const result = await dispatch(fetchCVEDetail({ 
        cveId, 
        forceRefresh: true,
        ignoreDebounce: true
      })).unwrap();
      
      log.debug('CVE 상세 정보 새로고침 완료');
      
      closeSnackbar();
      openSnackbar('데이터를 성공적으로 새로고침했습니다', 'success');
      snackbarShown.current = false;
      
      if (result && result.id) {
        subscribeToDetails(result.id);
      }
    } catch (error) {
      log.error('CVE 상세 정보 새로고침 실패', error);
      setError(error?.message || '데이터 새로고침 실패');
      
      closeSnackbar();
      openSnackbar('데이터 새로고침 실패: ' + (error?.message || '알 수 없는 오류'), 'error');
      snackbarShown.current = false;
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [cveId, dispatch, openSnackbar, closeSnackbar, subscribeToDetails]);

  // ... existing code ...
}; 