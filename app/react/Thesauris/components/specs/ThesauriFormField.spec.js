import React from 'react';
import { shallow } from 'enzyme';
import { ThesauriFormField } from '../ThesauriFormField';

describe('ThesauriFormField', () => {
  let component;
  let props;
  beforeEach(() => {
    props = {
      value: {
        label: 'Item1',
        id: 'item1'
      },
      index: 1,
      removeValue: jest.fn()
    };
  });

  const render = () => {
    component = shallow(<ThesauriFormField {...props}/>);
  };

  it('should render thesaurus item field', () => {
    render();
    expect(component).toMatchSnapshot();
    expect(component.find('.validation-error').exists()).toBe(false);
  });

  it('should render thesaurus item field when label duplicated', () => {
    props.isDuplicated = true;
    render();
    expect(component.find('.validation-error').exists()).toBe(true);
  });

  it('should not show duplication label when group item', () => {
    props.isDuplicated = true;
    props.groupIndex = 5;
    render();
    expect(component.find('.validation-error').exists()).toBe(false);
  });

  describe('delete button', () => {
    it('should remove item when clicked', () => {
      render();
      component.find('button').first().simulate('click');
      expect(props.removeValue).toHaveBeenCalledWith(props.index, undefined);
    });
    it('should pass groupIndex to removeValue if provided', () => {
      props.groupIndex = 5;
      render();
      component.find('button').first().simulate('click');
      expect(props.removeValue).toHaveBeenCalledWith(props.index, 5);
    });
  });
});
