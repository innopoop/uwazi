import React from 'react';
import {shallow} from 'enzyme';

import {GoogleAnalytics, trackPage} from '../GoogleAnalytics';

fdescribe('GoogleAnalytics', () => {
  let component;
  let props;

  beforeEach(() => {
    props = {
      analyticsTrackingId: 'X-AAA-Y'
    };
  });

  let render = () => {
    component = shallow(<GoogleAnalytics {...props} />);
  };

  it('should define a ga method', () => {
    render();
    component.instance().constructor(props);
    expect(window.ga).toEqual(jasmine.any(Function));
  });

  it('should render a script', () => {
    render();
    expect(component.find('script').length).toBe(1);
  });

  describe('when the thracking Id is not set', () => {
    beforeEach(() => {
      props.analyticsTrackingId = '';
    });

    it('should not render', () => {
      render();
      expect(component.find('script').length).toBe(0);
    });

    it('should not define ga', () => {
      delete window.ga;
      render();
      let notDefined;
      expect(window.ga).toBe(notDefined);
    });
  });

  describe('trackPage', () => {
    it('should send a pageview event to ga', () => {
      window.ga = jasmine.createSpy('ga');
      trackPage();
      expect(window.ga).toHaveBeenCalledWith('send', 'pageview');
    });

    describe('if ga is not defined does nothing', () => {
      delete window.ga;
      trackPage();
    });
  });
});
